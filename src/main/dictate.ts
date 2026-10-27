// Diktieren: drückt Win+H, damit die Spracheingabe von Windows in das fokussierte Feld schreibt (Claudes Eingabe).
// Keine eigene Spracherkennung, kein Netz von VibeDesk aus – Windows macht das selbst.
import { execFile } from 'child_process'

/** Win (0x5B) + H (0x48) drücken und loslassen – über user32 keybd_event, ohne Zusatzprogramme */
export const WIN_H_SCRIPT = [
  "$sig = '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);'",
  '$k = Add-Type -MemberDefinition $sig -Name VdKeys -Namespace VibeDesk -PassThru',
  '$k::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)',
  '$k::keybd_event(0x48, 0, 0, [UIntPtr]::Zero)',
  '$k::keybd_event(0x48, 0, 2, [UIntPtr]::Zero)',
  '$k::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)'
].join('; ')

export function openDictation(): Promise<boolean> {
  return new Promise((resolve) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_H_SCRIPT], { windowsHide: true, timeout: 10_000 }, (err) => resolve(!err))
  )
}
