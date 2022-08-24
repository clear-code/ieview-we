.PHONY: prepare xpi chrome chrome-dev host managed install_dependency lint format install_hook
TIMESTAMP=$(shell date +%Y%m%d)

NPM_MOD_DIR := $(CURDIR)/node_modules
NPM_BIN_DIR := $(NPM_MOD_DIR)/.bin

prepare:
	git submodule update --init
	cp submodules/webextensions-lib-configs/Configs.js extlib/; echo 'export default Configs;' >> extlib/Configs.js
	cp submodules/webextensions-lib-options/Options.js extlib/; echo 'export default Options;' >> extlib/Options.js
	cp submodules/webextensions-lib-l10n/l10n.js extlib/; echo 'export default l10n;' >> extlib/l10n.js

xpi: prepare
	rm -f ieview-we.xpi
	zip -r -9 ieview-we.xpi manifest.json *.js _locales common options misc/128x128.png extlib -x '*/.*' -x extlib/browser-polyfill.min.js

chrome: prepare
	[ -d node_modules ] || npm install
	rm -rf chrome ieview-we-${TIMESTAMP}.zip
	mkdir -p chrome/misc
	cat manifest.json | jq 'del(.applications)' | jq '.storage.managed_schema = "managed_schema.json"' > chrome/manifest.json
	cp -r managed_schema.json _locales background common options extlib chrome/
	cp -r misc/128x128.png chrome/misc
	find chrome -name '.*' | xargs rm -rf
	cp node_modules/webextension-polyfill/dist/browser-polyfill.min.js chrome/extlib/
	sed -i -r -e 's;("scripts": *\[);\1"extlib/browser-polyfill.min.js",;' chrome/manifest.json
	sed -i -r -e 's;<!--\s*(script.+extlib/browser-polyfill.+)\s*-->;<\1>;' chrome/options/options.html
	cd chrome && zip -r ../ieview-we-${TIMESTAMP}.zip .

chrome-dev: chrome
	rm -rf ieview-we-dev-${TIMESTAMP}.zip
	sed -i -E -e 's/IE View WE/IE View WE Developer Edition/g' chrome/_locales/*/messages.json
	cd chrome && zip -r ../ieview-we-dev-${TIMESTAMP}.zip .

# knldjmfmopnpolahpmmgbagdohdnhkik
DUMMY_KEY="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDcBHwzDvyBQ6bDppkIs9MP4ksKqCMyXQ/A52JivHZKh4YO/9vJsT3oaYhSpDCE9RPocOEQvwsHsFReW2nUEc6OLLyoCFFxIb7KkLGsmfakkut/fFdNJYh0xOTbSN8YvLWcqph09XAY2Y/f0AL7vfO1cuCqtkMt8hFrBGWxDdf9CQIDAQAB"

chrome-test: chrome
	cat chrome/manifest.json | jq '.key = ${DUMMY_KEY}' > chrome/manifest.json.tmp
	mv chrome/manifest.json.tmp chrome/manifest.json
	cd chrome && zip -r ../ieview-we-test-${TIMESTAMP}.zip .

host:
	host/build.sh
	rm -f ieview-we-host.zip
	cd host && zip -r -9 ../ieview-we-host.zip 386 amd64 *.bat *.json

managed: prepare
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
