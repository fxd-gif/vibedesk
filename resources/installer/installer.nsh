; VibeDesk-Installer: statt Windows-Dialog ein bildschirmfüllender Regen-Splash
; (eigener PowerShell-Prozess, damit er unabhängig vom stillen Installer zeichnen kann).
; Die Installation läuft unsichtbar dahinter, danach startet die App direkt und der Splash blendet aus.
; Bei Auto-Updates (--updated) bleibt alles still wie gehabt.

!ifndef BUILD_UNINSTALLER
Var vdSplash

!macro customInit
  StrCpy $vdSplash "0"
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    StrCpy $vdSplash "1"
    SetSilent silent
    SetOutPath "$TEMP\vibedesk-setup"
    File "/oname=$TEMP\vibedesk-setup\splash.png" "${BUILD_RESOURCES_DIR}\installer\splash.png"
    File "/oname=$TEMP\vibedesk-setup\splash.ps1" "${BUILD_RESOURCES_DIR}\installer\splash.ps1"
    ExecShell "open" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "$TEMP\vibedesk-setup\splash.ps1" "$TEMP\vibedesk-setup\splash.png"' SW_HIDE
  ${EndIf}
!macroend

!macro customInstall
  ${If} $vdSplash == "1"
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend
!endif
