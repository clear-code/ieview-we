@ECHO OFF

SET NAME=com.clear_code.ieview_we_host
SET INSTALL_DIR=%LocalAppData%\%NAME%
MD "%INSTALL_DIR%"
COPY *.exe "%INSTALL_DIR%\"
COPY *.json "%INSTALL_DIR%\"
COPY *.bat "%INSTALL_DIR%\"

FOR %%f IN ("%INSTALL_DIR%") DO SET EXPANDED_PATH=%%~sf
REG ADD "HKCU\SOFTWARE\Mozilla\NativeMessagingHosts\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f

