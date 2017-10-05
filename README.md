# IE View WE

Provides ability to open pages and links by Internet Explorer (Cloned IE View based on WebExtensions-based.)

This works only on Windows.

*IMPORTANT NOTE: The list of URLs which should be opened by IE is not compatible to the legacy version's one.*
You need to rewrite them based on the [matching pattern spec for Firefox addons](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns).
For example: `http://example.com` => `http://example.com/*` (note that the added wild card to match any page under the domain.)

# Steps to install

 1. Download a zip package of the native messaging host from the [releases page](https://github.com/clear-code/ieview-we/releases).
 2. Unzip downloaded file.
 3. Double-click the batch file named `install.bat`.
 4. Install "IE View WE" Firefox addon from its xpi package.

# Steps to uninstall

 1. Uninstall "IE View WE" Firefox addon via the addon manager.
 2. Double-click the batch file named `uninstall.bat`.

# How to build the native messaging host

```bash
$ make host
```

# License

MPL 2.0
