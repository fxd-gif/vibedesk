; VibeDesk-Installer: statt Windows-Dialog ein bildschirmfüllender Regen-Splash,
; Installation läuft unsichtbar dahinter, danach startet die App direkt.
; Bei Auto-Updates (--updated) bleibt alles still wie gehabt.

!ifndef BUILD_UNINSTALLER
Var vdSplash

!macro customInit
  StrCpy $vdSplash "0"
  ${IfNot} ${Silent}
  ${AndIfNot} ${isUpdated}
    StrCpy $vdSplash "1"
    SetSilent silent
    InitPluginsDir
    File "/oname=$PLUGINSDIR\vd-splash.bmp" "${BUILD_RESOURCES_DIR}\installer\splash.bmp"
    ; Bild (1100×620) mittig auf dunklem Grund
    System::Call 'user32::GetSystemMetrics(i 0) i .r0'
    System::Call 'user32::GetSystemMetrics(i 1) i .r1'
    IntOp $0 $0 - 1100
    IntOp $0 $0 / 2
    IntOp $1 $1 - 620
    IntOp $1 $1 / 2
    BgImage::SetBg /NOUNLOAD /GRADIENT 7 9 13 7 9 13
    BgImage::AddImage /NOUNLOAD "$PLUGINSDIR\vd-splash.bmp" $0 $1
    BgImage::Redraw /NOUNLOAD
  ${EndIf}
!macroend

!macro customInstall
  ${If} $vdSplash == "1"
    ; App starten und den Splash erst ausblenden, wenn ihr Fenster da ist
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    Sleep 2500
    BgImage::Destroy
  ${EndIf}
!macroend
!endif
