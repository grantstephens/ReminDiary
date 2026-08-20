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
TAGS   ?= ci

# Only pass -tags to go when TAGS is non-empty; "-tags " alone is an error.
GOTAGS := $(if $(TAGS),-tags $(TAGS),)

# The X/GL libraries the default GLFW desktop build links against. Used by
# `make deps` to report what is missing rather than letting cgo fail with a
# bare "no such file or directory" on a header.
DESKTOP_PKGS := gl x11 xcursor xrandr xinerama xi xxf86vm xkbcommon

.DEFAULT_GOAL := help
.PHONY: help run run-headless build test vet fmt check apk install deps clean

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
apk: ## Build an installable Android APK
	@command -v fyne >/dev/null 2>&1 || { \
		echo 'fyne CLI not found. Install it with:'; \
		echo '    go install fyne.io/tools/cmd/fyne@latest'; \
		exit 1; }
	@[ -n "$$ANDROID_HOME" ] || { \
		echo 'ANDROID_HOME is unset. Point it at your Android SDK.'; exit 1; }
	@[ -n "$$ANDROID_NDK_HOME" ] || [ -d "$$ANDROID_HOME/ndk-bundle" ] || { \
		echo 'ANDROID_NDK_HOME is unset and $$ANDROID_HOME/ndk-bundle does not exist.'; \
		echo 'Install the NDK and point ANDROID_NDK_HOME at it.'; exit 1; }
	cd $(MAINDIR) && fyne package -os android -app-id $(APP_ID) $(if $(RELEASE),--release,)
	mv $(FYNE_APK) $(APK)
	@echo '>> built $(APK)'

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
	rm -f $(APK) remindiary
	go clean -cache -testcache
