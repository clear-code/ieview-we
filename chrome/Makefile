.PHONY: clean zip

FILES = manifest.json \
        background.js

all: zip

clean:
	rm -f *.zip

zip: $(FILES)
	zip -9 - $(FILES) > ieview-we-chrome.zip
