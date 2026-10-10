import { useState, type FormEvent } from "react";
import { Chip, Header, toast } from "@/components/ui";
import { back, go } from "@/hooks/useRoute";
import { createProject, joinProject } from "@/lib/api";

const EMOJIS = ["🏠", "💰", "✈️", "🏖️", "🛒", "🚗", "👶", "🐶", "🎉", "💍", "🎄", "📚"];

const TEMPLATES = [
  { id: "casa", label: "Casa e dia a dia", hint: "Mercado, contas, restaurante, pets… com descrições sugeridas (Luz, Feira, Aluguel…)" },
  { id: "viagem", label: "Viagem", hint: "Passagens, hospedagem, passeios…" },
  { id: "vazio", label: "Em branco", hint: "Só “Outros”; você cria as categorias" },
];

export function NewProject() {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [template, setTemplate] = useState("casa");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createProject(name.trim(), emoji, template);
      go(`/p/${id}`, { replace: true });
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Novo projeto" onBack={() => back("/")} />
      <main className="page">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa, Viagem Chile 2027" required maxLength={60} autoFocus />
          </label>

          <div className="field">
            <span>Ícone</span>
            <div className="chips">
              {EMOJIS.map((e) => (
                <Chip key={e} active={emoji === e} onClick={() => setEmoji(e)}>
                  <span className="emoji-lg">{e}</span>
                </Chip>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Categorias iniciais</span>
            <div className="stack-sm">
              {TEMPLATES.map((t) => (
                <label key={t.id} className={`radio-card ${template === t.id ? "active" : ""}`}>
                  <input type="radio" name="tpl" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                  <span>
                    <strong>{t.label}</strong>
                    <span className="muted small">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <span className="muted small">Dá para editar depois, em Ajustes do projeto.</span>
          </div>

          <p className="muted small">A divisão começa 50/50 e vale para todas as despesas do projeto. Ajuste a proporção em Ajustes depois de convidar.</p>

          <button className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? "Criando…" : "Criar projeto"}
          </button>
        </form>
      </main>
    </>
  );
}

export function JoinProject({ code: initial }: { code?: string }) {
  const [code, setCode] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await joinProject(code);
      toast.ok("Você entrou no projeto!");
      go(`/p/${id}`, { replace: true });
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Entrar com convite" onBack={() => back("/")} />
      <main className="page">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Código do convite</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex.: 3fa9c01b2e"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={!initial}
            />
          </label>
          <button className="btn primary big" disabled={busy || !code.trim()}>
            {busy ? "Entrando…" : "Entrar no projeto"}
          </button>
        </form>
      </main>
    </>
  );
}
