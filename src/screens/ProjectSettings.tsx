import { useState } from "react";
import { Avatar, ErrorBox, Header, Loading, toast } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { back, go } from "@/hooks/useRoute";
import {
  addCategory,
  addSuggestion,
  deleteCategory,
  deleteProject,
  deleteSuggestion,
  listAllForBalance,
  setWeights,
  updateCategory,
  updateProject,
} from "@/lib/api";
import { computeNets, suggestTransfers } from "@/lib/balances";
import { formatBRL } from "@/lib/money";
import { weightsToPercents } from "@/lib/split";
import type { Category, Member, Project } from "@/lib/types";

export function ProjectSettings({ projectId, me }: { projectId: string; me: string }) {
  const proj = useProject(projectId);
  if (proj.error) {
    return (
      <>
        <Header title="Ajustes" onBack={() => back(`/p/${projectId}`)} />
        <main className="page">
          <ErrorBox message={proj.error} onRetry={proj.reload} />
        </main>
      </>
    );
  }
  if (!proj.data) return <Loading />;
  const { project, members, categories } = proj.data;

  return (
    <>
      <Header title="Ajustes do projeto" onBack={() => back(`/p/${projectId}`)} />
      <main className="page stack">
        <ProjectInfo key={project.id + project.name + project.emoji} project={project} />
        <Proportions key={members.map((m) => m.userId + m.weight).join()} projectId={projectId} members={members} me={me} />
        <Categories projectId={projectId} categories={categories} onChange={proj.reload} />

        <DangerZone project={project} />
      </main>
    </>
  );
}

const EMOJIS = ["🏠", "💰", "✈️", "🏖️", "🛒", "🚗", "👶", "🐶", "🎉", "💍", "🎄", "📚"];

function ProjectInfo({ project }: { project: Project }) {
  const [name, setName] = useState(project.name);
  const [emoji, setEmoji] = useState(project.emoji);
  const dirty = name.trim() !== project.name || emoji !== project.emoji;

  async function save() {
    try {
      await updateProject(project.id, { name: name.trim(), emoji });
      toast.ok("Projeto atualizado");
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Projeto</h2>
      <div className="row gap-sm">
        <select className="emoji-select" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Ícone">
          {[...new Set([emoji, ...EMOJIS])].map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Nome do projeto" />
      </div>
      {dirty && (
        <button className="btn primary" onClick={save} disabled={!name.trim()}>
          Salvar
        </button>
      )}
    </section>
  );
}

function Proportions({ projectId, members, me }: { projectId: string; members: Member[]; me: string }) {
  const [pct, setPct] = useState(() => weightsToPercents(members));
  const sum = pct.reduce((a, b) => a + b, 0);
  const original = weightsToPercents(members);
  const dirty = pct.some((p, i) => p !== original[i]);

  function setAt(i: number, value: number) {
    const v = Math.max(0, Math.min(100, Math.round(value) || 0));
    if (members.length === 2) setPct(i === 0 ? [v, 100 - v] : [100 - v, v]);
    else setPct(pct.map((p, k) => (k === i ? v : p)));
  }

  async function save() {
    const next = members.map((m, i) => ({ userId: m.userId, weight: pct[i] }));
    try {
      // Mudar a proporção recalcula todas as despesas, inclusive as já acertadas:
      // mostra o saldo antes/depois para ninguém ser pego de surpresa.
      const all = await listAllForBalance(projectId);
      const before = describe(computeNets(all.expenses, all.settlements, members));
      const after = describe(computeNets(all.expenses, all.settlements, next));
      const msg =
        all.expenses.length === 0
          ? "Salvar a nova proporção?"
          : `Isso recalcula as ${all.expenses.length} despesas já lançadas neste projeto.\n\n` +
            `Saldo hoje: ${before}\nSaldo depois: ${after}\n\nSalvar?`;
      if (!confirm(msg)) return;
      await setWeights(projectId, Object.fromEntries(next.map((n) => [n.userId, n.weight])));
      toast.ok("Proporção salva");
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  function describe(nets: Record<string, number>) {
    const t = suggestTransfers(nets);
    if (t.length === 0) return "quitado";
    const nm = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
    return t.map((x) => `${nm(x.from)} deve ${formatBRL(x.amountCents)} a ${nm(x.to)}`).join("; ");
  }

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Proporção da divisão</h2>
      <p className="muted small">Toda despesa deste projeto é dividida assim. Mudar aqui recalcula também as despesas já lançadas (e o saldo).</p>
      {members.length === 2 && (
        <input type="range" min={0} max={100} step={5} value={pct[0]} onChange={(e) => setAt(0, Number(e.target.value))} aria-label={`Parte de ${members[0].name}`} className="slider" />
      )}
      {members.map((m, i) => (
        <label key={m.userId} className="row between">
          <span className="row gap-sm">
            <Avatar name={m.name} size={28} /> {m.userId === me ? `${m.name} (você)` : m.name}
          </span>
          <span className="row gap-sm">
            <input className="pct-input" type="number" inputMode="numeric" min={0} max={100} value={pct[i]} onChange={(e) => setAt(i, Number(e.target.value))} />%
          </span>
        </label>
      ))}
      <div className="chips">
        {[
          [50, 50],
          [60, 40],
          [70, 30],
          [40, 60],
          [30, 70],
        ]
          .filter(() => members.length === 2)
          .map(([a, b]) => (
            <button key={a} type="button" className="chip" onClick={() => setPct([a, b])}>
              {a}/{b}
            </button>
          ))}
      </div>
      {sum !== 100 && <p className="text-err small">Soma {sum}% — precisa dar 100%.</p>}
      {dirty && (
        <button className="btn primary" onClick={save} disabled={sum !== 100}>
          Salvar proporção
        </button>
      )}
    </section>
  );
}

function Categories({ projectId, categories, onChange }: { projectId: string; categories: Category[]; onChange: () => void }) {
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏷️");
  const [open, setOpen] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, ok?: string) {
    try {
      await fn();
      if (ok) toast.ok(ok);
      onChange();
      return true;
    } catch (err) {
      toast.err((err as Error).message);
      return false;
    }
  }

  const nextPos = Math.max(0, ...categories.map((c) => c.position)) + 1;

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Categorias e descrições sugeridas</h2>
      <p className="muted small">As sugestões aparecem como atalho ao lançar uma despesa na categoria.</p>
      <ul className="cat-edit-list">
        {categories.map((c) => (
          <li key={c.id} className={c.archived ? "dim" : ""}>
            <div className="cat-edit-row">
              <input key={c.emoji} className="emoji-input" defaultValue={c.emoji} aria-label="Emoji" onBlur={(e) => e.target.value.trim() && e.target.value !== c.emoji && run(() => updateCategory(c.id, { emoji: e.target.value.trim() }))} />
              <input key={c.name} className="grow" defaultValue={c.name} aria-label="Nome da categoria" maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => updateCategory(c.id, { name: e.target.value.trim() }), "Categoria renomeada")} />
              <button className="btn small ghost" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                {c.suggestions.length} {open === c.id ? "▲" : "▼"}
              </button>
            </div>
            {open === c.id && (
              <SuggestionsEditor
                category={c}
                run={run}
                onArchive={() => run(() => updateCategory(c.id, { archived: !c.archived }))}
                onDelete={() => confirm(`Excluir “${c.name}”? As despesas dela ficam sem categoria.`) && run(() => deleteCategory(c.id), "Categoria excluída")}
              />
            )}
          </li>
        ))}
      </ul>
      <form
        className="row gap-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          if (await run(() => addCategory(projectId, newName.trim(), newEmoji.trim() || "🏷️", nextPos), "Categoria criada")) setNewName("");
        }}
      >
        <input className="emoji-input" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} aria-label="Emoji da nova categoria" />
        <input className="grow" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova categoria" maxLength={40} />
        <button className="btn primary small" disabled={!newName.trim()}>
          Adicionar
        </button>
      </form>
    </section>
  );
}

function SuggestionsEditor(props: {
  category: Category;
  run: (fn: () => Promise<void>, ok?: string) => Promise<boolean>;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { category: c, run } = props;
  const [text, setText] = useState("");
  const nextPos = Math.max(0, ...c.suggestions.map((s) => s.position)) + 1;

  return (
    <div className="suggestions-editor">
      {c.suggestions.length === 0 ? (
        <p className="muted small">Nenhuma sugestão ainda.</p>
      ) : (
        <div className="chips">
          {c.suggestions.map((sg) => (
            <span key={sg.id} className="chip removable">
              {sg.text}
              <button type="button" aria-label={`Remover ${sg.text}`} onClick={() => run(() => deleteSuggestion(sg.id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="row gap-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (await run(() => addSuggestion(c.id, text.trim(), nextPos))) setText("");
        }}
      >
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nova sugestão" maxLength={120} />
        <button className="btn primary small" disabled={!text.trim()}>
          Adicionar
        </button>
      </form>
      <div className="row gap-sm">
        <button className="btn small ghost" onClick={props.onArchive}>
          {c.archived ? "Mostrar no lançamento" : "Ocultar do lançamento"}
        </button>
        <button className="btn small danger" onClick={props.onDelete}>
          Excluir categoria
        </button>
      </div>
    </div>
  );
}

function DangerZone({ project }: { project: Project }) {
  async function act(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.ok(ok);
      go("/", { replace: true });
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Mais opções</h2>
      <button className="btn ghost" onClick={() => act(() => updateProject(project.id, { archived: !project.archived }), project.archived ? "Projeto reativado" : "Projeto arquivado")}>
        {project.archived ? "Desarquivar projeto" : "Arquivar projeto"}
      </button>
      <button
        className="btn danger"
        onClick={() =>
          prompt(`Isso apaga TODAS as despesas de “${project.name}” para os dois. Digite EXCLUIR para confirmar.`) === "EXCLUIR" &&
          act(() => deleteProject(project.id), "Projeto excluído")
        }
      >
        Excluir projeto
      </button>
    </section>
  );
}
