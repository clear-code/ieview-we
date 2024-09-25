.PHONY: xpi-prepare xpi chrome host managed install_dependency lint format install_hook
TIMESTAMP=$(shell date +%Y%m%d)

NPM_MOD_DIR := $(CURDIR)/node_modules
NPM_BIN_DIR := $(NPM_MOD_DIR)/.bin

xpi-prepare:
	git submodule update --init
	cp submodules/webextensions-lib-configs/Configs.js extlib/; echo 'export default Configs;' >> extlib/Configs.js
	cp submodules/webextensions-lib-options/Options.js extlib/; echo 'export default Options;' >> extlib/Options.js
	cp submodules/webextensions-lib-l10n/l10n.js extlib/; echo 'export default l10n;' >> extlib/l10n.js

xpi: xpi-prepare
	rm -f ieview-we.xpi
	zip -r -9 ieview-we.xpi manifest.json *.js _locales common options misc/128x128.png extlib -x '*/.*' -x extlib/browser-polyfill.min.js

chrome:
	[ -d node_modules ] || npm install
	rm -rf ieview-we-chrome-${TIMESTAMP}.zip
	cd chrome && make
	cp chrome/ieview-we-chrome.zip ./ieview-we-chrome-${TIMESTAMP}.zip

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

managed: xpi-prepare
	rm -f ieview-we-managed-storage.zip
	cd managed-storage && zip -r -9 ../ieview-we-managed-storage.zip *.bat *.json

all: host managed xpi chrome

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
