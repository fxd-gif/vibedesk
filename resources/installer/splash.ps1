# VibeDesk-Installer-Splash: bildschirmfüllend, blendet weich ein und wieder aus,
# sobald das VibeDesk-Fenster erscheint (spätestens nach 90 s).
param([string]$Image)

Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class VdDpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[VdDpi]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$bg = [Drawing.Color]::FromArgb(7, 9, 13)
$screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds

$form = New-Object Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Bounds = $screen
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = $bg
$form.Opacity = 0

# Bild ohne Dateisperre laden (der Installer räumt den Ordner später auf)
$bytes = [IO.File]::ReadAllBytes($Image)
$img = [Drawing.Image]::FromStream((New-Object IO.MemoryStream(, $bytes)))
$w = [Math]::Min($img.Width, [int]($screen.Width * 0.82))
$h = [int]($w * $img.Height / $img.Width)
$pic = New-Object Windows.Forms.PictureBox
$pic.SizeMode = 'Zoom'
$pic.BackColor = $bg
$pic.Image = $img
$pic.SetBounds([int](($screen.Width - $w) / 2), [int](($screen.Height - $h) / 2), $w, $h)
$form.Controls.Add($pic)

$script:state = 'in'
$script:ticks = 0
$start = Get-Date
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 30
$timer.Add_Tick({
  $script:ticks++
  if ($script:state -eq 'in') {
    $form.Opacity = [Math]::Min(1, $form.Opacity + 0.05)
    if ($form.Opacity -ge 1) { $script:state = 'wait' }
  } elseif ($script:state -eq 'wait') {
    if ($script:ticks % 15 -eq 0) {
      $app = Get-Process -Name VibeDesk -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
      if ($app -or ((Get-Date) - $start).TotalSeconds -gt 90) { $script:state = 'hold'; $script:holdUntil = $script:ticks + 25 }
    }
  } elseif ($script:state -eq 'hold') {
    # dem App-Fenster einen Moment geben, sich aufzubauen
    if ($script:ticks -ge $script:holdUntil) { $script:state = 'out' }
  } else {
    $form.Opacity = [Math]::Max(0, $form.Opacity - 0.04)
    if ($form.Opacity -le 0) { $timer.Stop(); $form.Close() }
  }
})
$form.Add_Shown({ $form.Activate(); $timer.Start() })
[Windows.Forms.Application]::Run($form)
