import { useEffect, useState, type ReactNode } from "react";
import { formatBRL } from "@/lib/money";

export function Header(props: { title: ReactNode; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="topbar">
      {props.onBack ? (
        <button className="icon-btn" onClick={props.onBack} aria-label="Voltar">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="icon-btn-spacer" />
      )}
      <h1 className="topbar-title">{props.title}</h1>
      {props.action ?? <span className="icon-btn-spacer" />}
    </header>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 45%)` }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Money({ cents, tone }: { cents: number; tone?: "pos" | "neg" | "muted" }) {
  return <span className={`money ${tone ?? ""}`}>{formatBRL(cents)}</span>;
}

export function Loading() {
  return (
    <div className="center-fill">
      <span className="spinner" aria-label="Carregando" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="btn ghost" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Chip(props: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${props.active ? "active" : ""}`} onClick={props.onClick} aria-pressed={props.active}>
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------- toast

let push: ((msg: string, kind: "ok" | "err") => void) | null = null;

export const toast = {
  ok: (msg: string) => push?.(msg, "ok"),
  err: (msg: string) => push?.(msg, "err"),
};

export function ToastHost() {
  const [item, setItem] = useState<{ msg: string; kind: "ok" | "err"; key: number } | null>(null);
  useEffect(() => {
    push = (msg, kind) => setItem({ msg, kind, key: Date.now() });
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem(null), item.kind === "err" ? 4500 : 2200);
    return () => clearTimeout(t);
  }, [item]);
  if (!item) return null;
  return (
    <div key={item.key} className={`toast ${item.kind}`} role="status">
      {item.msg}
    </div>
  );
}

/** Vibração curtinha ao salvar — dá a sensação de app nativo no Android. */
export function haptic() {
  try {
    navigator.vibrate?.(15);
  } catch {
    /* sem suporte */
  }
}
