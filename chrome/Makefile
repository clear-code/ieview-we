.PHONY: clean zip dev

FILES = manifest.json \
        misc/128x128.png \
        background.js

all: zip dev

clean:
	rm -f *.zip

zip: $(FILES)
	zip -9 - $(FILES) > ThinBridgeChrome.zip

dev: $(FILES)
	rm -rf dev
	mkdir -p dev
	cp -R manifest.json misc background.js dev/
	sed -i -E -e 's/ThinBridge/ThinBridge Enterprise Developer Edition/g' dev/manifest.json
	cd dev && zip -9 - $(FILES) > ../ThinBridgeChromeDev.zip
