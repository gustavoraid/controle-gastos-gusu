import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/api";

// Só login: as duas contas são criadas uma única vez no painel do Supabase.
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <img src="icons/icon.svg" alt="" className="login-logo" />
      <h1>Gastos GuSu</h1>
      <p className="muted">Quem pagou, quanto cada um deve, sem planilha.</p>

      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="text-err">{error}</p>}
        <button className="btn primary big" disabled={busy}>
          {busy ? "Aguarde…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
