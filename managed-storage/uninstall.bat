@ECHO OFF

SET NAME=ieview-we@clear-code.com

ECHO Uninstalling managed storage for %NAME%...

REG DELETE "HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /f

RMDIR /Q /S "%LocalAppData%\%NAME%"

ECHO Done.
PAUSE
