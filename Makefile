# ReminDiary
#
# TAGS defaults to "ci", which selects Fyne's software driver instead of GLFW.
# That is what lets every target work on a headless machine with no GL, X or
# xkb libraries installed. Override it to exercise the real desktop driver:
#
#     make test TAGS=
#
APP_ID := xyz.hub13.remindiary
APK    := remindiary.apk
# fyne package refuses --source-dir for mobile targets, so the APK is built from
# inside the main package and moved back here. FyneApp.toml and icon.png are
# symlinked into cmd/remindiary so fyne finds the metadata it needs.
MAINDIR := cmd/remindiary
FYNE_APK := $(MAINDIR)/ReminDiary.apk
AAB      := remindiary.aab
FYNE_AAB := $(MAINDIR)/ReminDiary.aab

# ABI selects which architectures go into the APK. Unset builds all four, which
# is what you want for an emulator but quadruples the download for a phone:
#
#     make apk RELEASE=1 ABI=arm64    # ~25MB, what a real device needs
#     make apk                        # ~122MB debug, all four ABIs
#
# RELEASE=1 adds --release. It only saves about 19% on its own — dropping the
# unused ABIs is what actually shrinks the package.
ABI ?=
ANDROID_TARGET := android$(if $(ABI),/$(ABI),)
TAGS   ?= ci

# Only pass -tags to go when TAGS is non-empty; "-tags " alone is an error.
GOTAGS := $(if $(TAGS),-tags $(TAGS),)

# The X/GL libraries the default GLFW desktop build links against. Used by
# `make deps` to report what is missing rather than letting cgo fail with a
# bare "no such file or directory" on a header.
DESKTOP_PKGS := gl x11 xcursor xrandr xinerama xi xxf86vm xkbcommon

.DEFAULT_GOAL := help
.PHONY: help run run-headless build test vet fmt check apk release android-env install deps clean

help: ## Show this help
	@echo 'ReminDiary — targets:'
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo 'Current TAGS=$(if $(TAGS),$(TAGS),<none>)'

run: ## Run on the desktop in a real window (needs the X/GL libs; see `make deps`)
	go run ./cmd/remindiary

run-headless: ## Run the full startup path with no display, then exit
	@echo '>> software driver: builds the UI, opens the database, exits immediately'
	go run -tags ci ./cmd/remindiary
	@echo '>> startup path OK'

build: ## Compile every package
	go build $(GOTAGS) ./...

test: ## Run the test suite
	go test $(GOTAGS) ./...

vet: ## Run go vet
	go vet $(GOTAGS) ./...

fmt: ## Report badly formatted files
	@out=$$(gofmt -l ./cmd ./internal ./tools); \
	if [ -n "$$out" ]; then echo "$$out"; exit 1; fi; \
	echo 'gofmt clean'

check: fmt vet test ## fmt + vet + test

# fyne package reads FyneApp.toml for the name, version and icon. icon.png is a
# committed asset, not a build product — icon.svg beside it is the editable
# source. The guards exist because fyne's own failure messages do not say which
# variable to set.
android-env: # Internal: the toolchain both Android targets need
	@command -v fyne >/dev/null 2>&1 || { \
		echo 'fyne CLI not found. Install it with:'; \
		echo '    go install fyne.io/tools/cmd/fyne@latest'; \
		exit 1; }
	@[ -n "$$ANDROID_HOME" ] || { \
		echo 'ANDROID_HOME is unset. Point it at your Android SDK.'; exit 1; }
	@[ -n "$$ANDROID_NDK_HOME" ] || [ -d "$$ANDROID_HOME/ndk-bundle" ] || { \
		echo 'ANDROID_NDK_HOME is unset and $$ANDROID_HOME/ndk-bundle does not exist.'; \
		echo 'Install the NDK and point ANDROID_NDK_HOME at it.'; exit 1; }

apk: android-env ## Build an installable Android APK (RELEASE=1 ABI=arm64 for a real phone)
	cd $(MAINDIR) && fyne package -os $(ANDROID_TARGET) -app-id $(APP_ID) $(if $(RELEASE),--release,)
	mv $(FYNE_APK) $(APK)
	@echo '>> built $(APK)'

# `fyne package --release` does NOT produce a Play-ready build. It only sets
# -ldflags=-w. The targetSdkVersion=35 branch in fyne's mobile/build.go is gated
# on `distribution`, which only `fyne release` sets — `fyne package` leaves the
# target at 29, which Play rejects.
#
# Passwords are deliberately not accepted as variables: fyne prompts for them on
# stdin, which keeps them out of your shell history and the process list.
#
# Do not pass ABI here. A Play bundle is meant to carry every ABI so Play can
# split per-device; ABI=arm64 is for sideloading a single phone.
release: android-env ## Build a signed .aab for Play (KEYSTORE=path KEY_NAME=alias)
	@command -v bundletool >/dev/null 2>&1 || { \
		echo 'bundletool not found — fyne release needs it to build the .aab.'; \
		echo '    Arch: yay -S android-bundletool'; \
		echo '    or:   https://developer.android.com/tools/bundletool'; \
		exit 1; }
	@[ -n "$(KEYSTORE)" ] || { \
		echo 'KEYSTORE is unset. Point it at your signing keystore:'; \
		echo '    make release KEYSTORE=~/keys/remindiary.keystore KEY_NAME=remindiary'; \
		exit 1; }
	@[ -f "$(KEYSTORE)" ] || { echo 'KEYSTORE does not exist: $(KEYSTORE)'; exit 1; }
	@[ -n "$(KEY_NAME)" ] || { echo 'KEY_NAME is unset (the key alias inside the keystore).'; exit 1; }
	cd $(MAINDIR) && fyne release -os $(ANDROID_TARGET) -app-id $(APP_ID) \
		--keystore $(abspath $(KEYSTORE)) --key-name $(KEY_NAME)
	mv $(FYNE_AAB) $(AAB)
	@echo '>> built $(AAB) — verify with: bundletool validate --bundle $(AAB)'

install: apk ## Build the APK and install it on a connected device
	@command -v adb >/dev/null 2>&1 || { echo 'adb not found (install android-tools).'; exit 1; }
	adb install -r $(APK)

deps: ## Report which desktop build libraries are missing
	@missing=''; \
	for p in $(DESKTOP_PKGS); do \
		pkg-config --exists $$p 2>/dev/null || missing="$$missing $$p"; \
	done; \
	if [ -z "$$missing" ]; then \
		echo 'All desktop libraries present — `make run` will work.'; \
	else \
		echo "Missing:$$missing"; \
		echo; \
		echo '`make run` cannot compile without these. Either install them:'; \
		echo '    sudo pacman -S libxkbcommon libxrandr libxinerama libxi'; \
		echo 'or stay headless — every other target already works as-is.'; \
	fi

clean: ## Remove build output
	rm -f $(APK) $(AAB) $(FYNE_APK) $(FYNE_AAB) remindiary
	go clean -cache -testcache
