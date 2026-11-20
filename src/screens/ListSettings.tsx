import { useEffect, useState, type FormEvent } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { ErrorBox, Header, Loading, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { back, go } from "@/hooks/useRoute";
import { createList, deleteList, getList, updateList } from "@/lib/api";
import { LIST_EMOJIS } from "@/lib/emoji";
import { forgetLastPlace } from "@/lib/storage";

/** Criar lista (sem id) ou editar nome/ícone e excluir (com id). Já nasce dos dois. */
export function ListSettings({ id }: { id?: string }) {
  const existing = useLoad(() => (id ? getList(id) : Promise.resolve(null)), [id]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛒");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setName(existing.data.list.name);
      setEmoji(existing.data.list.emoji);
    }
  }, [existing.data]);

  if (id && existing.error) {
    return (
      <>
        <Header title="Lista" onBack={() => back("/")} />
        <main className="page">
          <ErrorBox message={existing.error} onRetry={existing.reload} />
        </main>
      </>
    );
  }
  if (id && !existing.data) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (id) {
        await updateList(id, { name: name.trim(), emoji });
        back(`/l/${id}`);
      } else {
        const newId = await createList(name.trim(), emoji);
        go(`/l/${newId}`, { replace: true });
      }
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!id || !existing.data) return;
    const n = existing.data.items.length;
    if (!confirm(`Excluir a lista “${existing.data.list.name}”${n ? ` e seus ${n} itens` : ""}? Some para os dois.`)) return;
    try {
      await deleteList(id);
      forgetLastPlace(`/l/${id}`);
      go("/", { replace: true });
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  return (
    <>
      <Header title={id ? "Ajustes da lista" : "Nova lista"} onBack={() => back(id ? `/l/${id}` : "/")} />
      <main className="page">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Mercado, Tarefas de casa"
              required
              maxLength={60}
              autoFocus={!id}
            />
          </label>
          <div className="field">
            <span>Ícone</span>
            <EmojiPicker value={emoji} onChange={setEmoji} options={LIST_EMOJIS} />
          </div>
          <button className="btn primary big" disabled={busy || !name.trim()}>
            {id ? "Salvar" : "Criar lista"}
          </button>
          {id && (
            <button type="button" className="btn danger" onClick={remove}>
              Excluir lista
            </button>
          )}
        </form>
      </main>
    </>
  );
}
