@ECHO OFF

SET NAME=com.clear_code.ieview_we_host

ECHO Uninstalling %NAME%...

REG DELETE "HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /f

RMDIR /Q /S "%LocalAppData%\%NAME%"

ECHO Done.
PAUSE
