import { useState, type FormEvent } from "react";
import { Chip, Header, toast } from "@/components/ui";
import { back, go } from "@/hooks/useRoute";
import { useLoad } from "@/hooks/useLoad";
import { createProject, listProjects } from "@/lib/api";

const EMOJIS = ["🏠", "💰", "✈️", "🏖️", "🛒", "🚗", "👶", "🐶", "🎉", "💍", "🎄", "📚"];

export function NewProject({ me }: { me: string }) {
  const projects = useLoad(() => listProjects(me), [me]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const source = projects.data?.find((p) => p.id === copyFrom);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createProject(name.trim(), emoji, copyFrom || null);
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

          {projects.data && projects.data.length > 0 && (
            <label className="field">
              <span>Começar a partir de</span>
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">Base padrão (categorias de casa com sugestões)</option>
                {projects.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    Copiar de {p.emoji} {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="muted small">
            {source
              ? `Copia de “${source.name}” a proporção, as categorias e as descrições sugeridas. As despesas não são copiadas.`
              : "Começa com Mercado, Contas, Casa, Restaurante… e descrições sugeridas (Luz, Feira, Aluguel…). Tudo editável em Ajustes. O projeto já nasce com vocês dois, dividindo 50/50."}
          </p>

          <button className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? "Criando…" : "Criar projeto"}
          </button>
        </form>
      </main>
    </>
  );
}
