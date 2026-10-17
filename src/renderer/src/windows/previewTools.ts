// Vorschau → Claude: Konsolenfehler sammeln und „Zeig drauf“ (Element anklicken, Claude bekommt Selektor, Text und Bild).

export interface PreviewError {
  message: string
  source: string
  line: number
  count: number
}

export interface PickedElement {
  selector: string
  tag: string
  text: string
  html: string
  rect: { x: number; y: number; w: number; h: number }
}

export const ERRORS_MAX = 20

/** console-message der Webview → Fehler (alte Electron-Versionen: level 3, neue: 'error') */
export function consoleError(e: { level?: unknown; message?: unknown; line?: unknown; sourceId?: unknown }): Omit<PreviewError, 'count'> | null {
  const isErr = e.level === 3 || e.level === 'error'
  if (!isErr || typeof e.message !== 'string' || !e.message.trim()) return null
  return { message: e.message.slice(0, 800), source: typeof e.sourceId === 'string' ? e.sourceId : '', line: typeof e.line === 'number' ? e.line : 0 }
}

/** Gleiche Fehler zählen statt stapeln, neueste vorn */
export function pushError(list: PreviewError[], e: Omit<PreviewError, 'count'>): PreviewError[] {
  const same = list.find((x) => x.message === e.message && x.source === e.source && x.line === e.line)
  if (same) return [{ ...same, count: same.count + 1 }, ...list.filter((x) => x !== same)]
  return [{ ...e, count: 1 }, ...list].slice(0, ERRORS_MAX)
}

const shortSource = (s: string): string => {
  try {
    const u = new URL(s)
    return u.pathname.replace(/^\//, '') || u.host
  } catch {
    return s
  }
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function errorsPrompt(url: string, errs: PreviewError[]): string {
  const lines = errs
    .slice(0, 8)
    .map((e) => `• ${oneLine(e.message).slice(0, 300)}${e.source ? ` (${shortSource(e.source)}${e.line ? `:${e.line}` : ''})` : ''}${e.count > 1 ? ` ×${e.count}` : ''}`)
  return `Die Vorschau ${url} zeigt ${errs.length === 1 ? 'diesen Fehler' : 'diese Fehler'} in der Browser-Konsole: ${lines.join(' ')} – finde die Ursache und behebe sie.`
}

export function pickPrompt(url: string, p: PickedElement, wish: string, shot?: string): string {
  const text = oneLine(p.text).slice(0, 160)
  const html = oneLine(p.html).slice(0, 400)
  return [
    `In der Vorschau ${url} meine ich dieses Element: \`${p.selector}\``,
    text ? `mit dem Text „${text}“` : '',
    `(HTML: \`${html}\`).`,
    shot ? `Screenshot davon: ${shot}` : '',
    `Bitte: ${oneLine(wish)}`
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Läuft in der Seite der Vorschau: hebt das Element unter der Maus hervor und
 * liefert beim Klick dessen Daten (Esc bricht ab → null). Klicks erreichen die Seite nicht.
 */
export const PICK_SCRIPT = `(() => new Promise((resolve) => {
  if (window.__vdPick) window.__vdPick.cancel();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #7c9cff;background:rgba(124,156,255,.16);border-radius:4px;box-shadow:0 0 0 4000px rgba(10,12,20,.18);transition:all .06s';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#1e2433;color:#dfe6ff;font:11px/1.4 ui-monospace,monospace;padding:2px 7px;border-radius:5px;max-width:60vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
  document.documentElement.append(box, tag);
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const part = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + esc(el.id);
    const cls = [...el.classList].filter((c) => !/^(hover|active|focus)/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.map(esc).join('.');
    const p = el.parentElement;
    if (p) {
      const same = [...p.children].filter((c) => c.tagName === el.tagName);
      if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
    }
    return s;
  };
  const sel = (el) => {
    const out = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement && out.length < 5; e = e.parentElement) {
      out.unshift(part(e));
      if (e.id) break;
    }
    return out.join(' > ');
  };
  const show = (el) => {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    tag.textContent = sel(el);
    tag.style.left = Math.max(4, r.left) + 'px';
    tag.style.top = (r.top > 24 ? r.top - 22 : r.bottom + 4) + 'px';
  };
  const block = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const move = (e) => { if (e.target instanceof Element) show(e.target); };
  const click = (e) => {
    block(e);
    const el = e.target;
    const r = el.getBoundingClientRect();
    done({ selector: sel(el), tag: el.tagName.toLowerCase(), text: (el.innerText || el.textContent || '').trim().slice(0, 300), html: el.outerHTML.slice(0, 800), rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  };
  const key = (e) => { if (e.key === 'Escape') { block(e); done(null); } };
  const evs = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu'];
  const done = (v) => {
    removeEventListener('mousemove', move, true);
    removeEventListener('click', click, true);
    removeEventListener('keydown', key, true);
    evs.forEach((n) => removeEventListener(n, block, true));
    box.remove(); tag.remove();
    window.__vdPick = null;
    resolve(v);
  };
  addEventListener('mousemove', move, true);
  addEventListener('click', click, true);
  addEventListener('keydown', key, true);
  evs.forEach((n) => addEventListener(n, block, true));
  window.__vdPick = { cancel: () => done(null) };
}))()`

export const CANCEL_PICK_SCRIPT = 'window.__vdPick && window.__vdPick.cancel()'
