# VibeDesk-Update-Brücke: dasselbe kleine Fensterchen wie in der App, solange der stille
# Installer läuft. Schließt sich, sobald die neue VibeDesk-Version ein Fenster zeigt (spätestens nach 90 s).
#
# Aufruf aus VibeDesk mit -Launch: Dieser kurze Starter startet das eigentliche Fensterchen per Start-Process
# und endet sofort. Nur so überlebt es das Beenden von VibeDesk: Direkt gestartete Kindprozesse liegen im
# Job-Objekt von Electron und sterben mit; mit "detached" bekommt PowerShell keine Konsole und endet sofort.
# -Ready: Datei, die angelegt wird, sobald das Fensterchen voll sichtbar ist – erst dann beendet sich VibeDesk.
param([string]$Version, [string]$Ready, [switch]$Launch)

if ($Launch) {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $quote = { param($s) '"' + ($s -replace '"', '') + '"' }
  Start-Process -FilePath $ps -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', (& $quote $PSCommandPath), '-Version', (& $quote $Version), '-Ready', (& $quote $Ready))
  exit 0
}

Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class VdDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[VdDpi]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$start = Get-Date
$scale = [Windows.Forms.Screen]::PrimaryScreen.Bounds.Height / 1080
if ($scale -lt 1) { $scale = 1 }
$W = [int](300 * $scale); $H = [int](340 * $scale)
# Nacht-Design wie die App: Flaeche --bg-2, Text --ink/--ink-2, Fortschritt aus Zeichen statt Leuchtball
$bg = [Drawing.Color]::FromArgb(16, 20, 31)
$ink = [Drawing.Color]::FromArgb(227, 231, 239)
$ink2 = [Drawing.Color]::FromArgb(163, 171, 187)
$ink3 = [Drawing.Color]::FromArgb(111, 120, 138)

$form = New-Object Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object Drawing.Size($W, $H)
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Text = 'VibeDesk'
$form.BackColor = $bg
$form.Opacity = 0
# ohne Doppelpuffer flackert der Balken
$form.GetType().GetProperty('DoubleBuffered', [Reflection.BindingFlags]'NonPublic,Instance').SetValue($form, $true)

$script:pos = 0
$script:ticks = 0
$script:state = 'in'
$form.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'ClearTypeGridFit'
  # feiner Rand wie die Fenster der App
  $g.DrawRectangle((New-Object Drawing.Pen([Drawing.Color]::FromArgb(36, 170, 185, 215), 1)), 0, 0, $W - 1, $H - 1)
  $fmt = New-Object Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $title = New-Object Drawing.Font('Segoe UI Semibold', [single](22 * $scale), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('VibeDesk', $title, (New-Object Drawing.SolidBrush($ink)), (New-Object Drawing.RectangleF(0, [single](118 * $scale), $W, [single](32 * $scale))), $fmt)
  $small = New-Object Drawing.Font('Segoe UI', [single](13 * $scale), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  # Auslassungspunkte und Spinner-Zeichen als Zeichencode: PowerShell 5.1 liest Skripte ohne BOM als ANSI
  $dots = [string][char]0x2026
  $text = if ($Version) { "Installiere Update $Version $dots" } else { "Installiere Update $dots" }
  $g.DrawString($text, $small, (New-Object Drawing.SolidBrush($ink2)), (New-Object Drawing.RectangleF(0, [single](164 * $scale), $W, [single](22 * $scale))), $fmt)
  # Fortschritt aus Zeichen [---###----] und ein Spinner, der in vier Stufen dichter wird
  $mono = New-Object Drawing.Font('Consolas', [single](12 * $scale), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  $spin = @([string][char]0x00B7, ':', [string][char]0x00A6, '|')[[int][Math]::Floor($script:ticks / 5) % 4]
  $p = [int]$script:pos
  $cells = -join (0..9 | ForEach-Object { if ($_ -ge $p - 3 -and $_ -lt $p) { '#' } else { '-' } })
  $g.DrawString("$spin  [$cells]", $mono, (New-Object Drawing.SolidBrush($ink3)), (New-Object Drawing.RectangleF(0, [single](204 * $scale), $W, [single](20 * $scale))), $fmt)
})

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 30
$timer.Add_Tick({
  $script:ticks++
  # der Block aus drei # wandert in Stufen (alle 150 ms eine Zelle) - kein fluessiges Gleiten
  if ($script:ticks % 5 -eq 0) {
    $script:pos += 1
    if ($script:pos -gt 12) { $script:pos = 0 }
    $form.Invalidate()
  }
  if ($script:state -eq 'in') {
    # 1.0 statt 1: sonst nimmt PowerShell Math.Min(int, int), aus 0.1 wird 0 und das Fenster bleibt unsichtbar
    $form.Opacity = [Math]::Min(1.0, $form.Opacity + 0.1)
    if ($form.Opacity -ge 1) {
      $script:state = 'wait'
      if ($Ready) { try { [IO.File]::WriteAllText($Ready, 'ok') } catch {} }
    }
  } elseif ($script:state -eq 'wait') {
    if ($script:ticks % 15 -eq 0) {
      # nur neu gestartete VibeDesk-Prozesse zählen – die alte Version schließt sich gerade erst
      $app = Get-Process -Name VibeDesk -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.StartTime -gt $start }
      if ($app -or ((Get-Date) - $start).TotalSeconds -gt 90) { $script:state = 'out' }
    }
  } else {
    $form.Opacity = [Math]::Max(0.0, $form.Opacity - 0.08)
    if ($form.Opacity -le 0) { $timer.Stop(); $form.Close() }
  }
})
$form.Add_Shown({ $timer.Start() })
[Windows.Forms.Application]::Run($form)
