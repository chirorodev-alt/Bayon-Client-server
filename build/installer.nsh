!macro customInstall
  ; Hide runtime support files in Explorer. SYSTEM keeps them out of the
  ; default listing even when the user enables "show hidden files".
  ExecWait '"$SYSDIR\attrib.exe" +h +s "$INSTDIR\*"'
  ExecWait '"$SYSDIR\attrib.exe" +h +s "$INSTDIR\resources\app.asar"'
  ExecWait '"$SYSDIR\attrib.exe" -h -s "$INSTDIR\Bayon Client.exe"'
  ExecWait '"$SYSDIR\attrib.exe" -h -s "$INSTDIR\Uninstall Bayon Client.exe"'
!macroend
