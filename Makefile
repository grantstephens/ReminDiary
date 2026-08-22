# ReminDiary — React Native (Expo), the primary implementation.
#
# The original Fyne/Go app lives in legacy-fyne/ and is kept working until this
# app reaches parity and the real diary data has been migrated across by CSV.
# Its own targets are namespaced `legacy-*` below and delegate via `make -C`.

.DEFAULT_GOAL := help
.PHONY: help check test typecheck start web android \
        legacy-check legacy-run legacy-run-headless legacy-apk legacy-install legacy-clean

help: ## Show this help
	@echo 'ReminDiary — targets:'
	@grep -hE '^[a-zA-Z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

check: ## tsc --noEmit && jest — the gate before any commit
	npm run check

test: ## Run the Jest suite
	npm test

typecheck: ## tsc --noEmit only
	npm run typecheck

start: ## Expo dev server; scan the QR code with Expo Go
	npm start

web: ## Browser build, the no-device iteration story
	npm run web

android: ## Expo dev server, opening on a connected device
	npm run android

## --- Legacy Fyne/Go app (legacy-fyne/) -------------------------------------

legacy-check: ## gofmt + go vet + go test for the legacy Fyne app
	$(MAKE) -C legacy-fyne check

legacy-run: ## Run the legacy Fyne desktop app in a real window
	$(MAKE) -C legacy-fyne run

legacy-run-headless: ## Legacy app's full startup path, no display, exits immediately
	$(MAKE) -C legacy-fyne run-headless

legacy-apk: ## Build the legacy Fyne app's Android APK
	$(MAKE) -C legacy-fyne apk

legacy-install: ## Build the legacy APK and install it on a connected device
	$(MAKE) -C legacy-fyne install

legacy-clean: ## Remove the legacy app's build output
	$(MAKE) -C legacy-fyne clean
