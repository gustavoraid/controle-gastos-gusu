import { useState, type FormEvent } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Header, toast } from "@/components/ui";
import { back, go } from "@/hooks/useRoute";
import { useLoad } from "@/hooks/useLoad";
import { createProject, listProjects } from "@/lib/api";
import { PROJECT_TYPES, type ProjectType } from "@/lib/types";


export function NewProject({ me }: { me: string }) {
  const projects = useLoad(() => listProjects(me), [me]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [type, setType] = useState<ProjectType>("casa");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const source = projects.data?.find((p) => p.id === copyFrom);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createProject(name.trim(), emoji, type, copyFrom || null);
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
            <span>Tipo</span>
            <div className="segmented">
              {PROJECT_TYPES.map((t) => (
                <button type="button" key={t.id} className={type === t.id ? "active" : ""} onClick={() => setType(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Ícone</span>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </div>

          {projects.data && projects.data.length > 0 && (
            <label className="field">
              <span>Começar a partir de</span>
              <select
                value={copyFrom}
                onChange={(e) => {
                  setCopyFrom(e.target.value);
                  const src = projects.data?.find((p) => p.id === e.target.value);
                  if (src) setType(src.type);
                }}
              >
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
              ? `Copia de “${source.name}” a proporção, as moedas (com a cotação), as categorias e as descrições sugeridas. As despesas não são copiadas.`
              : "Começa com Mercado, Contas, Casa, Restaurante… e descrições sugeridas (Luz, Feira, Aluguel…). Tudo editável em Ajustes. O projeto já nasce com os dois, dividindo 50/50."}
          </p>

          <button className="btn primary big" disabled={busy || !name.trim()}>
            {busy ? "Criando…" : "Criar projeto"}
          </button>
        </form>
      </main>
    </>
  );
}
