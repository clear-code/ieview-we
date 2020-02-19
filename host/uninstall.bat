@ECHO OFF

SET NAME=com.clear_code.ieview_we_host

ECHO Uninstalling %NAME%...

ECHO Checking permission...
SET INSTALL_DIR=%ProgramFiles%\%NAME%
SET REG_BASE=HKLM
MD "%INSTALL_DIR%_try"
IF EXIST "%INSTALL_DIR%_try\" (
  ECHO Uninstall for all users
  RMDIR /Q /S "%INSTALL_DIR%_try"
) ELSE (
  ECHO Uninstall for the current user
  SET INSTALL_DIR=%LocalAppData%\%NAME%
  SET REG_BASE=HKCU
)

REG DELETE "%REG_BASE%\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /f
REG DELETE "%REG_BASE%\SOFTWARE\Google\Chrome\NativeMessagingHosts\%NAME%" /f

RMDIR /Q /S "%INSTALL_DIR%"

ECHO Done.
PAUSE
