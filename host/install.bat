@ECHO OFF

SET NAME=com.clear_code.ieview_we_host

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
IF %PROCESSOR_ARCHITECTURE% == AMD64 (
  ECHO Copying binary for AMD64...
  COPY amd64\*.exe "%INSTALL_DIR%\"
) ELSE (
  ECHO Copying binary for x86...
  COPY 386\*.exe "%INSTALL_DIR%\"
)
COPY *.json "%INSTALL_DIR%\"
COPY *.bat "%INSTALL_DIR%\"

ECHO Registering...
FOR %%f IN ("%INSTALL_DIR%") DO SET EXPANDED_PATH=%%~sf
REG ADD "%REG_BASE%\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f
REG ADD "%REG_BASE%\SOFTWARE\Google\Chrome\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f

ECHO Done.
PAUSE
