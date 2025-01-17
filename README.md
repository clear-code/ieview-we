# Project Status

This project will no longer be updated and no future updates are planned. Please consider using [BrowserSelector](https://gitlab.com/clear-code/browserselector) as the alternative.

# IE View WE

Provides ability to open pages and links by Internet Explorer (Cloned IE View based on WebExtensions-based.)

This works only on Windows.

# for Google Chrome (IE View WE MV3)

This was initially started as a cloned IE View based on WebExtensions API, but finally dropped support of original IE View compatible features including the options page.
Only ThinBridge compatible implementation is left on the browser extension part, thus you need to install [ThinBridge](https://github.com/ThinBridge/ThinBridge/) as the native messaging host.

1. Download the [latest installer of ThinBridge](https://github.com/ThinBridge/ThinBridge/releases).
2. Install ThinBridge with the installer.
3. Put an [example configuration file](https://raw.githubusercontent.com/ThinBridge/ThinBridge/master/Resources/ThinBridgeBHO.ini) to the location `C:\Program Files\ThinBridge\ThinBridgeBHO.ini`.

And you need to install this extension via GPO.

1. Add a URL entry `"chrome-extension://gahanoflpdcmbcaijjkopjeheaikclcl/"` to the list of `"allowed_origins"` in `C:\Program Files\ThinBridge\ThinBridgeHost\chrome.json `.
2. Install group policy template for Chrome and configure Chrome to load the addon.
   1. Download [Google Chrome Bundle](https://support.google.com/chrome/a/answer/187202?hl=en#zippy=%2Cwindows) and extract contents of the saved zip file.
   2. Copy `Configuration\admx\*.admx`, `Configuration\admx\en-US` and `Configuration\admx\ja` to `C:\Windows\PolicyDefinitions`.
   3. Launch `gpedit.msc` and open `Local Computer Policy` => `Computer Configuration` => `Administrative Templates` => `Google` => `Google Chrome` => `Extensions` => `Configure the list of force-installed apps and extensions`.
   4. Switch it to `Enabled`.
   5. Click `Show...`.
   6. Add `gahanoflpdcmbcaijjkopjeheaikclcl` to the list.
3. Set up the client as a domain member if it is not joined to any Active Directory domain. For example, lauch `cmd.exe` as the system administrator and run following commands.
   (Ref: https://hitco.at/blog/apply-edge-policies-for-non-domain-joined-devices/ )
   ```
   reg add HKLM\SOFTWARE\Microsoft\Enrollments\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v EnrollmentState /t reg_dword /d 1 /f
   reg add HKLM\SOFTWARE\Microsoft\Enrollments\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v EnrollmentType /t reg_dword /d 0 /f
   reg add HKLM\SOFTWARE\Microsoft\Enrollments\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v IsFederated /t reg_dword /d 0 /f
   reg add HKLM\SOFTWARE\Microsoft\Provisioning\OMADM\Accounts\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v Flags /t reg_dword /d 0xd6fb7f /f
   reg add HKLM\SOFTWARE\Microsoft\Provisioning\OMADM\Accounts\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v AcctUId /t reg_sz /d "0x000000000000000000000000000000000000000000000000000000000000000000000000" /f
   reg add HKLM\SOFTWARE\Microsoft\Provisioning\OMADM\Accounts\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v RoamingCount /t reg_dword /d 0 /f
   reg add HKLM\SOFTWARE\Microsoft\Provisioning\OMADM\Accounts\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v SslClientCertReference /t reg_sz /d "MY;User;0000000000000000000000000000000000000000" /f
   reg add HKLM\SOFTWARE\Microsoft\Provisioning\OMADM\Accounts\FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF /v ProtoVer /t reg_sz /d "1.2" /f
   ```
4. Launch Chrome and confirm the IE VIew WE MV3 is automatically installed.

# for Firefox (IE View WE MV2)

*IMPORTANT NOTE: The list of URLs which should be opened by IE is not compatible to the legacy version's one.*
You need to rewrite them based on the [matching pattern spec for Firefox addons](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns).
For example: `http://example.com` => `http://example.com/*` (note that the added wild card to match any page under the domain.)

## Steps to install

 1. Download the MSI suitable for your environment's architecture, or a zip package "ieview-we-host.zip" from the [releases page](https://github.com/clear-code/ieview-we/releases/latest).
 2. If you've downloaded an MSI, run it to install. Otherwise, unzip the downloaded file and double-click the batch file named "install.bat".
 3. [Install "IE View WE" Firefox addon from its xpi package.](https://addons.mozilla.org/firefox/addon/ie-view-we/)

## Steps to uninstall

 1. Uninstall "IE View WE" Firefox addon via the addon manager.
 2. Double-click the batch file named `uninstall.bat`.

## How to customize Options

There are some options which you can customize default behavior:
You can also customize preset configuration via MCD.

* `extensions.ieview.ieapp` Path to Internet Explorer (default: auto detection)
* `extensions.ieview.ieargs` Command Line Arguments (default: empty)
* `extensions.ieview.contextMenu` Add "Open by IE" items to the context menu (default: true)

### Rules to open by ...

* `extensions.ieview.forceielist` Websites to be opened by IE always (default: empty)
* `extensions.ieview.disableForce` Disable websites opened by IE always (dfault: false)
* `extensions.ieview.sitesOpenedBySelf` Exceptive websites (opened in Firefox directly) (default: empty)
* `extensions.ieview.disableException` Disable websites directly opened by Firefox (default: false)
* `extensions.ieview.onlyMainFrame` Only check URL which is shown in location bar (default: true)
* `extensions.ieview.ignoreQueryString` Ignore query string in URL (default: false)

### Logging & Debugging

* `extensions.ieview.debug` Print Debug log (default: false)
* `extensions.ieview.logging` Save log (default: true)
* `extensions.ieview.logRotationTime` Rotate log file by specified hour (default: 24)
* `extensions.ieview.logRotationCount` Max count of log files (default: 12)

### How to build the native messaging host and its installer

On Windows 10 + WSL:

1. [Install and setup Golang](https://golang.org/doc/install) on your Linux environment.
2. Install go-msi https://github.com/mh-cbon/go-msi *via an MSI to your Windows environment*.
3. Install WiX Toolset https://wixtoolset.org/releases/ to your Windows environment.
4. Set PATH to go-msi (ex. `C:\Program Files\go-msi`) and WiX Toolse (ex. `C:\Program Files (x86)\WiX Toolset v3.11\bin`).
5. Run `make host`.
   Then `.exe` files and a batch file to build MSI will be generated.
6. Double-click the generated `host\build_msi.bat` on your Windows environment.
   Then two MSIs will be generated.

# License

MPL 2.0
