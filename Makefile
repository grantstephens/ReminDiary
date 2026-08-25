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

prepare-release: ## Write+commit fdroid-version.txt for TAG=vX.Y.Z (does not tag or push)
	@test -n "$(TAG)" || (echo "Usage: make prepare-release TAG=v1.0.1" && exit 1)
	@eval "$$(tools/compute-version.sh $(TAG))"; \
	printf 'versionName=%s\nversionCode=%s\n' "$$versionName" "$$versionCode" > fdroid-version.txt
	@cat fdroid-version.txt
	git add fdroid-version.txt
	git commit -m "chore: prepare fdroid-version.txt for $(TAG)"
	@echo
	@echo "Committed. Now create and push the tag:"
	@echo "  git tag $(TAG)"
	@echo "  git push origin main $(TAG)"
