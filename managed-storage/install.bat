@ECHO OFF

SET NAME=ieview-we@clear-code.com

ECHO Installing %NAME%...

ECHO Checking permission...
SET INSTALL_DIR=%ProgramFiles%\%NAME%
SET REG_BASE=HKLM
MD "%INSTALL_DIR%_try"
IF EXIST "%INSTALL_DIR%_try\" (
  ECHO Install for all users
  RMDIR /Q /S "%INSTALL_DIR%_try"
) ELSE (
  ECHO Install for the current user
  SET INSTALL_DIR=%LocalAppData%\%NAME%
  SET REG_BASE=HKCU
)

MD "%INSTALL_DIR%"
CD /D %~dp0
COPY *.json "%INSTALL_DIR%\"

ECHO Registering...
FOR %%f IN ("%INSTALL_DIR%") DO SET EXPANDED_PATH=%%~sf
REG ADD "%REG_BASE%\SOFTWARE\Mozilla\ManagedStorage\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f

ECHO Done.
PAUSE
