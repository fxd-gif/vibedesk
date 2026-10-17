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
$bg = [Drawing.Color]::FromArgb(7, 9, 13)
$accent = [Drawing.Color]::FromArgb(88, 101, 242)

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

$script:pos = -0.35
$script:ticks = 0
$script:state = 'in'
$form.Add_Paint({
  param($s, $e)
  $g = $e.Graphics
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'ClearTypeGridFit'
  $o = [int](72 * $scale); $ox = [int](($W - $o) / 2); $oy = [int](70 * $scale)
  $orb = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Rectangle($ox, $oy, $o, $o)), [Drawing.Color]::FromArgb(169, 184, 255), $accent, 45)
  $g.FillEllipse($orb, $ox, $oy, $o, $o)
  $fmt = New-Object Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $title = New-Object Drawing.Font('Segoe UI Semibold', [single](20 * $scale), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('VibeDesk', $title, [Drawing.Brushes]::White, (New-Object Drawing.RectangleF(0, [single](160 * $scale), $W, [single](30 * $scale))), $fmt)
  $small = New-Object Drawing.Font('Segoe UI', [single](13 * $scale), [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
  $grey = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(180, 232, 236, 243))
  # Auslassungspunkte als Zeichencode: PowerShell 5.1 liest Skripte ohne BOM als ANSI
  $dots = [string][char]0x2026
  $text = if ($Version) { "Installiere Update $Version $dots" } else { "Installiere Update $dots" }
  $g.DrawString($text, $small, $grey, (New-Object Drawing.RectangleF(0, [single](205 * $scale), $W, [single](22 * $scale))), $fmt)
  $bw = [int](200 * $scale); $bh = [int](4 * $scale); $bx = [int](($W - $bw) / 2); $by = [int](245 * $scale)
  $g.FillRectangle((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(20, 255, 255, 255))), $bx, $by, $bw, $bh)
  $g.SetClip((New-Object Drawing.Rectangle($bx, $by, $bw, $bh)))
  $g.FillRectangle((New-Object Drawing.SolidBrush($accent)), [int]($bx + $bw * $script:pos), $by, [int]($bw * 0.35), $bh)
})

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 30
$timer.Add_Tick({
  $script:ticks++
  $script:pos += 0.025
  if ($script:pos -gt 1) { $script:pos = -0.35 }
  $form.Invalidate()
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
