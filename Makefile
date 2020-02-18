.PHONY: prepare xpi chrome host managed

prepare:
	git submodule update --init
	cp submodules/webextensions-lib-configs/Configs.js extlib/
	cp submodules/webextensions-lib-options/Options.js extlib/
	cp submodules/webextensions-lib-l10n/l10n.js extlib/

xpi: prepare
	rm -f ieview-we.xpi
	zip -r -9 ieview-we.xpi *.json *.js _locales common options extlib -x '*/.*'

chrome: prepare
	[ -d node_modules ] || npm install
	rm -rf chrome
	mkdir -p chrome
	cp -r manifest.json *.js _locales common options extlib chrome/
	find chrome -name '.*' | xargs rm -rf
	cp node_modules/webextension-polyfill/dist/browser-polyfill.min.js extlib/
	sed -i -r -e 's;("scripts": *\[);\1"extlib/browser-polyfill.min.js",;' chrome/manifest.json
	sed -i -r -e 's;<!--\s*(script.+extlib/browser-polyfill.+)\s*-->;<\1>;' chrome/options/options.html

host:
	host/build.sh
	rm -f ieview-we-host.zip
	cd host && zip -r -9 ../ieview-we-host.zip 386 amd64 *.bat *.json

managed: prepare
	rm -f ieview-we-managed-storage.zip
	cd managed-storage && zip -r -9 ../ieview-we-managed-storage.zip *.bat *.json

all: host managed xpi chrome

