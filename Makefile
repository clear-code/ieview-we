.PHONY: chrome chrome-dev host install_dependency lint format install_hook
TIMESTAMP=$(shell date +%Y%m%d)

NPM_MOD_DIR := $(CURDIR)/node_modules
NPM_BIN_DIR := $(NPM_MOD_DIR)/.bin

chrome:
	[ -d node_modules ] || npm install
	rm -rf ieview-we-chrome-${TIMESTAMP}.zip
	cd chrome && make
	cp chrome/ieview-we-chrome.zip ./ieview-we-chrome-${TIMESTAMP}.zip

chrome-dev:
	[ -d node_modules ] || npm install
	rm -rf ieview-we-chrome-${TIMESTAMP}.zip
	cd chrome && make dev
	cp chrome/ieview-we-chrome-dev.zip ./ieview-we-chrome-dev-${TIMESTAMP}.zip

# knldjmfmopnpolahpmmgbagdohdnhkik
DUMMY_KEY="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDcBHwzDvyBQ6bDppkIs9MP4ksKqCMyXQ/A52JivHZKh4YO/9vJsT3oaYhSpDCE9RPocOEQvwsHsFReW2nUEc6OLLyoCFFxIb7KkLGsmfakkut/fFdNJYh0xOTbSN8YvLWcqph09XAY2Y/f0AL7vfO1cuCqtkMt8hFrBGWxDdf9CQIDAQAB"

chrome-test:
	cat chrome/manifest.json | jq '.key = ${DUMMY_KEY}' > chrome/manifest.json.tmp
	mv chrome/manifest.json.tmp chrome/manifest.json
	cd chrome && make dev
	cp chrome/ieview-we-chrome-dev.zip ./ieview-we-chrome-dev-${TIMESTAMP}.zip

host:
	host/build.sh
	rm -f ieview-we-host.zip
	cd host && zip -r -9 ../ieview-we-host.zip 386 amd64 *.bat *.json

all: host chrome

clean:
	rm -rf chrome
	rm -f *.zip
	rm -f *.xpi

install_dependency:
	[ -e "$(NPM_BIN_DIR)/eslint" -a -e "$(NPM_BIN_DIR)/jsonlint-cli" ] || npm install --save-dev

lint: install_dependency
	"$(NPM_BIN_DIR)/eslint" . --ext=.js --report-unused-disable-directives
	find . -type d -name node_modules -prune -o -type f -name '*.json' -print | xargs "$(NPM_BIN_DIR)/jsonlint-cli"

format: install_dependency
	"$(NPM_BIN_DIR)/eslint" . --ext=.js --report-unused-disable-directives --fix

install_hook:
	echo '#!/bin/sh\nmake lint' > "$(CURDIR)/.git/hooks/pre-commit" && chmod +x "$(CURDIR)/.git/hooks/pre-commit"
