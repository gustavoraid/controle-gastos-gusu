import { useState, type FormEvent } from "react";
import { signIn, signUp } from "@/lib/api";

export function Login() {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "err" | "ok" } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "entrar") {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password, name.trim());
        if (needsConfirmation) {
          setMsg({ kind: "ok", text: "Conta criada. Confirme pelo link no seu e-mail e depois entre aqui." });
          setMode("entrar");
        }
      }
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <img src="icons/icon.svg" alt="" className="login-logo" />
      <h1>Gastos do Casal</h1>
      <p className="muted">Quem pagou, quanto cada um deve, sem planilha.</p>

      <form onSubmit={submit} className="stack">
        {mode === "criar" && (
          <label className="field">
            <span>Seu nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="given-name" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "entrar" ? "current-password" : "new-password"}
          />
        </label>
        {msg && <p className={msg.kind === "err" ? "text-err" : "text-ok"}>{msg.text}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <button className="btn link" onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}>
        {mode === "entrar" ? "Primeira vez? Criar conta" : "Já tenho conta"}
      </button>
    </main>
  );
}
