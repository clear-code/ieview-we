@ECHO OFF

SET NAME=ieview-we@clear-code.com

ECHO Uninstalling managed storage for %NAME%...

ECHO Checking permission...
SET INSTALL_DIR=%ProgramData%\%NAME%
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

RMDIR /Q /S "%INSTALL_DIR%"

ECHO Done.
PAUSE
