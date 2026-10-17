// Windows-Firewall für den Handy-Zugang über Tailscale.
// Falle: Windows führt das Tailscale-Netz meist als „privat“, die automatisch angelegten
// Regeln („Zugriff zulassen“-Dialog) gelten aber oft nur für öffentliche Netze – dann kommt
// vom Handy nichts an. Prüfen geht ohne Adminrechte, Freigeben fragt einmal per UAC.
import { execFile } from 'child_process'
import { firewallVerdict, type FirewallState } from '../shared/companion'

export const RULE_NAME = 'VibeDesk Handy (Tailscale)'

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

/** Pfad in PowerShell-Einzelanführungszeichen */
const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`

function ps(script: string, timeout: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile('powershell.exe', [...PS, script], { timeout, windowsHide: true }, (err, out) => resolve({ ok: !err, out: String(out ?? '') }))
  })
}

/** Ausgabe des Prüf-Skripts → Urteil (getrennt, damit es testbar ist) */
export function parseFirewallProbe(raw: string): FirewallState {
  let j: { category?: unknown; rules?: unknown }
  try {
    j = JSON.parse(raw.trim() || '{}')
  } catch {
    return 'unknown'
  }
  const category = typeof j.category === 'string' ? j.category : undefined
  const list = Array.isArray(j.rules) ? j.rules : j.rules && typeof j.rules === 'object' ? [j.rules] : []
  const rules = list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ action: String(r.action ?? ''), profile: String(r.profile ?? ''), remote: r.remote == null ? undefined : String(r.remote) }))
  return firewallVerdict(category, rules)
}

/** Kommt das Tailscale-Netz zu diesem Programm durch? */
export async function firewallState(exe: string = process.execPath): Promise<FirewallState> {
  if (process.platform !== 'win32') return 'ok'
  const script = [
    'function Norm($p) { try { [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($p)) } catch { $p } }',
    `$exe = Norm ${psQuote(exe)}`,
    "$cat = (Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -like '*Tailscale*' } | Select-Object -First 1).NetworkCategory",
    '$rules = @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | Where-Object { $_.Program -and (Norm $_.Program) -eq $exe } | ForEach-Object {',
    '  $r = $_ | Get-NetFirewallRule',
    "  if ($r.Enabled -eq 'True' -and $r.Direction -eq 'Inbound') {",
    '    $a = ($r | Get-NetFirewallAddressFilter).RemoteAddress -join \',\'',
    '    [pscustomobject]@{ action = "$($r.Action)"; profile = "$($r.Profile)"; remote = $a }',
    '  }',
    '})',
    '[pscustomobject]@{ category = "$cat"; rules = $rules } | ConvertTo-Json -Compress -Depth 3'
  ].join('\n')
  const r = await ps(script, 20_000)
  if (!r.ok) return 'unknown'
  const v = parseFirewallProbe(r.out)
  // kein Profil gefunden (Adapter heißt anders) → lieber nichts behaupten
  return /"category":""/.test(r.out) ? 'unknown' : v
}

/**
 * Freigabe nur für das Tailscale-Netz und das eigene Subnetz, in allen Profilen.
 * Windows fragt dafür einmal nach Adminrechten (UAC).
 */
export async function openFirewall(exe: string = process.execPath): Promise<boolean> {
  if (process.platform !== 'win32') return true
  const args = `advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow program="${exe}" enable=yes profile=any remoteip=100.64.0.0/10,LocalSubnet`
  const script = `try { $p = Start-Process -FilePath netsh.exe -ArgumentList ${psQuote(args)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1 }`
  const r = await ps(script, 120_000)
  return r.ok && (await firewallState(exe)) !== 'blocked'
}
