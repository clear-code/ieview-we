@ECHO OFF

SET NAME=com.clear_code.ieview_we_host
SET INSTALL_DIR=%LocalAppData%\%NAME%
MD "%INSTALL_DIR%"
IF %PROCESSOR_ARCHITECTURE% == AMD64 (
  COPY amd64\*.exe "%INSTALL_DIR%\"
) ELSE (
  COPY 386\*.exe "%INSTALL_DIR%\"
)
COPY *.json "%INSTALL_DIR%\"
COPY *.bat "%INSTALL_DIR%\"

FOR %%f IN ("%INSTALL_DIR%") DO SET EXPANDED_PATH=%%~sf
REG ADD "HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f

