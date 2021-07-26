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
 4. [Install "IE View WE" Firefox addon from its xpi package.](https://addons.mozilla.org/firefox/addon/ie-view-we/)

# Steps to uninstall

 1. Uninstall "IE View WE" Firefox addon via the addon manager.
 2. Double-click the batch file named `uninstall.bat`.

# How to customize Options

There are some options which you can customize default behavior:
You can also customize preset configuration via MCD.

* `extensions.ieview.ieapp` Path to Internet Explorer (default: auto detection)
* `extensions.ieview.ieargs` Command Line Arguments (default: empty)
* `extensions.ieview.contextMenu` Add "Open by IE" items to the context menu (default: true)

## Rules to open by ...

* `extensions.ieview.forceielist` Websites to be opened by IE always (default: empty)
* `extensions.ieview.disableForce` Disable websites opened by IE always (dfault: false)
* `extensions.ieview.sitesOpenedBySelf` Exceptive websites (opened in Firefox directly) (default: empty)
* `extensions.ieview.disableException` Disable websites directly opened by Firefox (default: false)
* `extensions.ieview.onlyMainFrame` Only check URL which is shown in location bar (default: true)
* `extensions.ieview.ignoreQueryString` Ignore query string in URL (default: false)

## Logging & Debugging

* `extensions.ieview.debug` Print Debug log (default: false)
* `extensions.ieview.logging` Save log (default: true)
* `extensions.ieview.logRotationTime` Rotate log file by specified hour (default: 24)
* `extensions.ieview.logRotationCount` Max count of log files (default: 12)

## How to build the native messaging host and its installer

On Windows 10 + WSL:

1. [Install and setup Golang](https://golang.org/doc/install) on your Linux environment.
2. Install go-msi https://github.com/mh-cbon/go-msi *via an MSI to your Windows environment*.
3. Install WiX Toolset https://wixtoolset.org/releases/ to your Windows environment.
4. Set PATH to go-msi (ex. `C:\Program Files\go-msi`) and WiX Toolse (ex. `C:\Program Files (x86)\WiX Toolset v3.11\bin`).
   Then `.exe` files and a batch file to build MSI will be generated.
5. Run `make host`.
6. Double-click the generated `host\build_msi.bat` on your Windows environment.
   Then two MSIs will be generated.

# License

MPL 2.0
