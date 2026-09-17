# ReminDiary — React Native (Expo).

.DEFAULT_GOAL := help
.PHONY: help check test typecheck start web android prepare-release

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

prepare-release: ## Write+commit fdroid-version.txt + F-Droid changelogs for TAG=vX.Y.Z CHANGELOG=path/to/notes.txt (does not tag or push)
	@test -n "$(TAG)" || (echo "Usage: make prepare-release TAG=v1.0.1 CHANGELOG=path/to/notes.txt" && exit 1)
	@test -n "$(CHANGELOG)" || (echo "Usage: make prepare-release TAG=v1.0.1 CHANGELOG=path/to/notes.txt" && exit 1)
	@test -f "$(CHANGELOG)" || (echo "$(CHANGELOG): no such file - write the release notes first" && exit 1)
	@eval "$$(tools/compute-version.sh $(TAG))"; \
	printf 'versionName=%s\nversionCode=%s\n' "$$versionName" "$$versionCode" > fdroid-version.txt; \
	v7a=$$(( versionCode * 10 + 1 )); \
	v8a=$$(( versionCode * 10 + 2 )); \
	cp "$(CHANGELOG)" "fastlane/metadata/android/en-US/changelogs/$$v7a.txt"; \
	cp "$(CHANGELOG)" "fastlane/metadata/android/en-US/changelogs/$$v8a.txt"
	@cat fdroid-version.txt
	git add fdroid-version.txt fastlane/metadata/android/en-US/changelogs/
	git commit -m "chore: prepare fdroid-version.txt + changelog for $(TAG)"
	@echo
	@echo "Committed. Now create and push the tag:"
	@echo "  git tag $(TAG)"
	@echo "  git push origin main $(TAG)"
