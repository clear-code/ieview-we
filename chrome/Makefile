.PHONY: clean zip dev

FILES = manifest.json \
        background.js

all: zip dev

clean:
	rm -f *.zip

zip: $(FILES)
	zip -9 - $(FILES) > ieview-we-chrome.zip

dev: $(FILES)
	rm -rf dev
	mkdir -p dev
	cp -R manifest.json background.js dev/
	sed -i -E -e 's/ThinBridge/ThinBridge Enterprise Developer Edition/g' dev/manifest.json
	cd dev && zip -9 - $(FILES) > ../ieview-we-chrome-dev.zip
