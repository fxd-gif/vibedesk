import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import type { FileEntry } from "../../../../shared/types";
import { samePath } from "../../store/editorModel";
import {
  createEntry,
  deleteEntry,
  isUnder,
  renameEntry,
} from "../../store/fileOps";

type Node = FileEntry[] | "loading" | { error: string };

interface Props {
  root: string;
  active: string | null;
  onOpen(path: string): void;
}

interface Menu {
  x: number;
  y: number;
  /** null = Projektwurzel (Rechtsklick auf freie Fläche) */
  entry: FileEntry | null;
}

const parentOf = (p: string): string => p.replace(/[\\/][^\\/]+[\\/]*$/, "");

export function FileTree({ root, active, onOpen }: Props): React.JSX.Element {
  const [nodes, setNodes] = useState<Record<string, Node>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]));
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const load = useCallback(async (dir: string) => {
    setNodes((n) => (n[dir] ? n : { ...n, [dir]: "loading" }));
    const r = await api.files.list(dir);
    setNodes((n) => ({ ...n, [dir]: r.ok ? r.entries : { error: r.message } }));
  }, []);

  useEffect(() => {
    setNodes({});
    setExpanded(new Set([root]));
    setSelected(null);
    load(root);
  }, [root, load]);

  useEffect(() => {
    if (!menu) return;
    const close = (): void => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const refresh = (): void => {
    for (const d of expanded) load(d);
  };

  const toggle = (dir: string): void => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        load(dir);
      }
      return next;
    });
  };

  /** Zielordner für „Neu“: der gewählte Ordner, sonst der Ordner der gewählten Datei, sonst die Wurzel. */
  const targetDir = (e: FileEntry | null): string =>
    !e ? root : e.dir ? e.path : parentOf(e.path);

  const create = async (
    kind: "file" | "dir",
    e: FileEntry | null = selected,
  ): Promise<void> => {
    const dir = targetDir(e);
    const made = await createEntry(dir, kind);
    if (!made) return;
    // Ziel und Zwischenordner (a/b/c.ts) aufklappen und neu laden
    const chain: string[] = [];
    for (
      let d = kind === "dir" ? made : parentOf(made);
      isUnder(d, dir);
      d = parentOf(d)
    ) {
      chain.push(d);
      if (samePath(d, dir)) break;
    }
    setExpanded((s) => new Set([...s, ...chain]));
    chain.forEach((d) => load(d));
    setSelected({
      name: made.split(/[\\/]/).pop() ?? made,
      path: made,
      dir: kind === "dir",
    });
  };

  const rename = async (e: FileEntry): Promise<void> => {
    const np = await renameEntry(e.path);
    if (!np) return;
    const parent = parentOf(e.path);
    // aufgeklappte Unterordner verschieben sich mit
    setExpanded(
      (s) =>
        new Set(
          [...s].map((d) =>
            isUnder(d, e.path) ? np + d.slice(e.path.length) : d,
          ),
        ),
    );
    setNodes((n) =>
      Object.fromEntries(
        Object.entries(n).filter(([k]) => !isUnder(k, e.path)),
      ),
    );
    setSelected({ ...e, path: np, name: np.split(/[\\/]/).pop() ?? np });
    load(parent);
  };

  const remove = async (e: FileEntry): Promise<void> => {
    if (!(await deleteEntry(e.path, e.dir))) return;
    setExpanded((s) => new Set([...s].filter((d) => !isUnder(d, e.path))));
    setNodes((n) =>
      Object.fromEntries(
        Object.entries(n).filter(([k]) => !isUnder(k, e.path)),
      ),
    );
    setSelected(null);
    load(parentOf(e.path));
  };

  const onKey = (ev: React.KeyboardEvent): void => {
    if (!selected || menu) return;
    if (ev.key === "F2") (ev.preventDefault(), rename(selected));
    else if (ev.key === "Delete") (ev.preventDefault(), remove(selected));
  };

  const openMenu = (ev: React.MouseEvent, entry: FileEntry | null): void => {
    ev.preventDefault();
    ev.stopPropagation();
    if (entry) setSelected(entry);
    setMenu({ x: ev.clientX, y: ev.clientY, entry });
  };

  const render = (dir: string, depth: number): React.ReactNode => {
    const n = nodes[dir];
    if (!n || n === "loading")
      return (
        <div className="ftree-msg" style={{ paddingLeft: 14 + depth * 12 }}>
          …
        </div>
      );
    if (!Array.isArray(n))
      return (
        <div className="ftree-msg err" style={{ paddingLeft: 14 + depth * 12 }}>
          {n.error}
        </div>
      );
    if (!n.length)
      return (
        <div className="ftree-msg" style={{ paddingLeft: 14 + depth * 12 }}>
          leer
        </div>
      );
    return n.map((e) => {
      const open = e.dir && expanded.has(e.path);
      const isActive = !e.dir && active && samePath(active, e.path);
      const isSel = selected && samePath(selected.path, e.path);
      return (
        <div key={e.path}>
          <button
            className={`ftree-row${isActive ? " on" : ""}${isSel ? " sel" : ""}${e.dir ? " dir" : ""}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => {
              setSelected(e);
              if (e.dir) toggle(e.path);
              else onOpen(e.path);
            }}
            onContextMenu={(ev) => openMenu(ev, e)}
            title={e.path}
            data-testid="ftree-row"
          >
            <span className={`ftree-caret${open ? " open" : ""}`}>
              {e.dir ? "›" : ""}
            </span>
            <span className="ftree-name">{e.name}</span>
          </button>
          {open && render(e.path, depth + 1)}
        </div>
      );
    });
  };

  const m = menu;
  const item = (
    label: string,
    run: () => void,
    opts: { danger?: boolean; hint?: string; testid?: string } = {},
  ): React.JSX.Element => (
    <button
      className={`ctx-item${opts.danger ? " danger" : ""}`}
      onPointerDown={(ev) => ev.stopPropagation()}
      onClick={() => {
        setMenu(null);
        run();
      }}
      data-testid={opts.testid}
    >
      <span>{label}</span>
      {opts.hint && <kbd>{opts.hint}</kbd>}
    </button>
  );

  return (
    <div className="ftree" onKeyDown={onKey}>
      <div className="ftree-head">
        <span>Dateien</span>
        <span className="ftree-tools">
          <button
            className="ftree-refresh"
            title="Neue Datei"
            onClick={() => create("file")}
            data-testid="ftree-new-file"
          >
            +
          </button>
          <button
            className="ftree-refresh"
            title="Neuer Ordner"
            onClick={() => create("dir")}
            data-testid="ftree-new-dir"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6" />
            </svg>
          </button>
          <button className="ftree-refresh" title="Neu laden" onClick={refresh}>
            ↻
          </button>
        </span>
      </div>
      <div
        className="ftree-body"
        onContextMenu={(ev) => openMenu(ev, null)}
        onClick={(ev) => ev.target === ev.currentTarget && setSelected(null)}
      >
        {render(root, 0)}
      </div>
      {m &&
        createPortal(
          <div
            className="ctx-menu"
            style={{
              left: Math.min(m.x, window.innerWidth - 210),
              top: Math.min(m.y, window.innerHeight - 220),
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
            data-testid="ftree-menu"
          >
            {item("Neue Datei …", () => create("file", m.entry), {
              testid: "ctx-new-file",
            })}
            {item("Neuer Ordner …", () => create("dir", m.entry), {
              testid: "ctx-new-dir",
            })}
            {m.entry && (
              <>
                <div className="ctx-sep" />
                {item("Umbenennen …", () => rename(m.entry!), {
                  hint: "F2",
                  testid: "ctx-rename",
                })}
                {item("Im Explorer zeigen", () =>
                  api.files.reveal(m.entry!.path),
                )}
                {item("Pfad kopieren", () =>
                  api.clipboard.write(m.entry!.path),
                )}
                <div className="ctx-sep" />
                {item("Löschen", () => remove(m.entry!), {
                  danger: true,
                  hint: "Entf",
                  testid: "ctx-delete",
                })}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
