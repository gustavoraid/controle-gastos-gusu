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
  ratesOf,
  removeCurrency,
  setRate,
  addCurrency,
  type Rates,
  setWeights,
  updateCategory,
  updateProject,
} from "@/lib/api";
import { computeNets, inBrl, suggestTransfers } from "@/lib/balances";
import {
  CURRENCIES,
  MAX_EXTRA_CURRENCIES,
  currencyDecimals,
  currencyName,
  formatMoney,
  parseRate,
  rateToInput,
  toBrlCents,
} from "@/lib/currency";
import { formatBRL } from "@/lib/money";
import { parseWeight, percentLabels } from "@/lib/split";
import {
  PROJECT_TYPES,
  type Category,
  type Member,
  type Project,
  type ProjectCurrency,
  type ProjectType,
} from "@/lib/types";

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
  const { project, members, categories, currencies } = proj.data;

  return (
    <>
      <Header title="Ajustes do projeto" onBack={() => back(`/p/${projectId}`)} />
      <main className="page stack">
        <ProjectInfo key={project.id + project.name + project.emoji + project.type} project={project} />
        <Proportions
          key={members.map((m) => m.userId + m.weight).join()}
          projectId={projectId}
          members={members}
          rates={ratesOf(currencies)}
          me={me}
        />
        <Currencies
          key={currencies.map((c) => c.code + c.rate).join() + project.defaultCurrency}
          project={project}
          members={members}
          currencies={currencies}
          onChange={proj.reload}
        />
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
  const [type, setType] = useState<ProjectType>(project.type);
  const dirty = name.trim() !== project.name || emoji !== project.emoji || type !== project.type;

  async function save() {
    try {
      await updateProject(project.id, { name: name.trim(), emoji, type });
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
      <div className="segmented" aria-label="Tipo do projeto">
        {PROJECT_TYPES.map((t) => (
          <button type="button" key={t.id} className={type === t.id ? "active" : ""} onClick={() => setType(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {dirty && (
        <button className="btn primary" onClick={save} disabled={!name.trim()}>
          Salvar
        </button>
      )}
    </section>
  );
}

const PRESETS: [number, number][] = [
  [1, 1],
  [3, 2],
  [2, 1],
  [7, 3],
  [2, 3],
  [1, 2],
];

/**
 * Mudar proporção ou cotação recalcula todas as despesas, inclusive as já acertadas:
 * mostra o saldo antes/depois e pede confirmação. Devolve true se confirmado.
 */
async function confirmRecalc(params: {
  projectId: string;
  members: Member[];
  rates: Rates;
  nextMembers?: Member[];
  nextRates?: Rates;
  what: string;
}): Promise<boolean> {
  const { projectId, members, rates } = params;
  const all = await listAllForBalance(projectId);
  if (all.expenses.length === 0) return confirm(`Salvar ${params.what}?`);
  const describe = (nets: Record<string, number>) => {
    const t = suggestTransfers(nets);
    if (t.length === 0) return "quitado";
    const nm = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
    return t.map((x) => `${nm(x.from)} deve ${formatBRL(x.amountCents)} a ${nm(x.to)}`).join("; ");
  };
  const before = describe(computeNets(inBrl(all.expenses, rates), all.settlements, members));
  const after = describe(
    computeNets(inBrl(all.expenses, params.nextRates ?? rates), all.settlements, params.nextMembers ?? members),
  );
  return confirm(
    `Isso recalcula as despesas já lançadas neste projeto.\n\n` +
      `Saldo hoje: ${before}\nSaldo depois: ${after}\n\nSalvar ${params.what}?`,
  );
}

function Proportions({ projectId, members, rates, me }: { projectId: string; members: Member[]; rates: Rates; me: string }) {
  const fmt = (w: number) => String(w).replace(".", ",");
  const [inputs, setInputs] = useState(() => members.map((m) => fmt(m.weight)));
  const parsed = inputs.map(parseWeight);
  const valid = parsed.every((w) => w !== null) && parsed.some((w) => (w ?? 0) > 0);
  const next = members.map((m, i) => ({ userId: m.userId, weight: parsed[i] ?? 0 }));
  const labels = percentLabels(next);
  const dirty = next.some((n, i) => n.weight !== members[i].weight);

  async function save() {
    try {
      const nextMembers = members.map((m, i) => ({ ...m, weight: next[i].weight }));
      if (!(await confirmRecalc({ projectId, members, rates, nextMembers, what: "a nova proporção" }))) return;
      await setWeights(projectId, Object.fromEntries(next.map((n) => [n.userId, n.weight])));
      toast.ok("Proporção salva");
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Proporção da divisão</h2>
      <p className="muted small">
        Pesos livres: 1 e 2 significa que um assume um terço e o outro dois terços. Mudar aqui recalcula também as
        despesas já lançadas (e o saldo).
      </p>
      {members.map((m, i) => (
        <label key={m.userId} className="row between">
          <span className="row gap-sm">
            <Avatar name={m.name} size={28} /> {m.userId === me ? `${m.name} (você)` : m.name}
          </span>
          <span className="row gap-sm">
            <input
              className="pct-input"
              inputMode="decimal"
              value={inputs[i]}
              onChange={(e) => setInputs(inputs.map((v, k) => (k === i ? e.target.value.replace(/[^\d.,]/g, "") : v)))}
              aria-label={`Peso de ${m.name}`}
            />
            <span className="muted pct-label">{valid ? labels[i] : "—"}</span>
          </span>
        </label>
      ))}
      {members.length === 2 && (
        <div className="chips">
          {PRESETS.map(([a, b]) => (
            <button key={`${a}-${b}`} type="button" className="chip" onClick={() => setInputs([fmt(a), fmt(b)])}>
              {a} : {b}
            </button>
          ))}
        </div>
      )}
      {!valid && <p className="text-err small">Use números (pode ter vírgula) e pelo menos um peso maior que zero.</p>}
      {dirty && (
        <button className="btn primary" onClick={save} disabled={!valid}>
          Salvar proporção
        </button>
      )}
    </section>
  );
}

/** Exemplo para conferir a cotação: 100 unidades, ou 10.000 para moedas "pequenas". */
function sampleAmount(code: string, rate: number): number {
  const units = rate < 0.1 ? 10_000 : 100;
  return units * 10 ** currencyDecimals(code);
}

function Currencies(props: {
  project: Project;
  members: Member[];
  currencies: ProjectCurrency[];
  onChange: () => void;
}) {
  const { project, members, currencies } = props;
  const extras = currencies.filter((c) => c.code !== "BRL");
  const available = CURRENCIES.filter((c) => !currencies.some((pc) => pc.code === c.code));
  const [newCode, setNewCode] = useState(available[0]?.code ?? "");
  const [newRate, setNewRate] = useState("");
  const [rates, setRates] = useState(() => Object.fromEntries(extras.map((c) => [c.code, rateToInput(c.rate)])));

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast.ok(ok);
      props.onChange();
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  async function saveRate(code: string) {
    const rate = parseRate(rates[code] ?? "");
    if (!rate) return toast.err("Cotação inválida.");
    const current = ratesOf(currencies);
    try {
      const ok = await confirmRecalc({
        projectId: project.id,
        members,
        rates: current,
        nextRates: { ...current, [code]: rate },
        what: `a cotação do ${code}`,
      });
      if (ok) await run(() => setRate(project.id, code, rate), "Cotação salva");
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  const parsedNew = parseRate(newRate);

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Moedas</h2>
      <p className="muted small">
        Despesas podem ser lançadas em até {MAX_EXTRA_CURRENCIES} moedas além do real. O saldo e o acerto são sempre em
        reais, pela cotação daqui — mudar a cotação recalcula as despesas já lançadas.
      </p>

      <ul className="currency-list">
        <li className="row between">
          <span>
            <strong>R$</strong> Real
          </span>
          <span className="muted small">sempre disponível</span>
        </li>
        {extras.map((c) => {
          const typed = parseRate(rates[c.code] ?? "");
          const dirty = typed !== null && typed !== c.rate;
          const sample = sampleAmount(c.code, typed ?? c.rate);
          return (
            <li key={c.code} className="stack-sm">
              <div className="row between">
                <span>
                  <strong>{c.code}</strong> {currencyName(c.code)}
                </span>
                <button
                  className="btn small ghost"
                  onClick={() =>
                    confirm(`Remover ${c.code} do projeto?`) &&
                    run(() => removeCurrency(project.id, c.code, project.defaultCurrency === c.code), "Moeda removida")
                  }
                >
                  Remover
                </button>
              </div>
              <label className="row gap-sm">
                <span className="muted small">1 {c.code} = R$</span>
                <input
                  className="grow"
                  inputMode="decimal"
                  value={rates[c.code] ?? ""}
                  onChange={(e) => setRates({ ...rates, [c.code]: e.target.value.replace(/[^\d.,]/g, "") })}
                  aria-label={`Cotação do ${c.code}`}
                />
                {dirty && (
                  <button className="btn small primary" onClick={() => saveRate(c.code)}>
                    Salvar
                  </button>
                )}
              </label>
              <span className="muted small">
                {typed
                  ? `Conferência: ${formatMoney(sample, c.code)} = ${formatBRL(toBrlCents(sample, c.code, typed))}`
                  : "Cotação inválida"}
              </span>
            </li>
          );
        })}
      </ul>

      {currencies.length > 1 && (
        <div className="field">
          <span>Moeda que vem selecionada ao lançar</span>
          <div className="segmented">
            {currencies.map((c) => (
              <button
                type="button"
                key={c.code}
                className={project.defaultCurrency === c.code ? "active" : ""}
                onClick={() =>
                  project.defaultCurrency !== c.code &&
                  run(() => updateProject(project.id, { default_currency: c.code }), "Moeda padrão alterada")
                }
              >
                {c.code === "BRL" ? "R$" : c.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {extras.length < MAX_EXTRA_CURRENCIES && available.length > 0 && (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!parsedNew || !newCode) return;
            run(() => addCurrency(project.id, newCode, parsedNew), `${newCode} adicionada`);
          }}
        >
          <div className="row gap-sm">
            <select className="currency-select" value={newCode} onChange={(e) => setNewCode(e.target.value)} aria-label="Nova moeda">
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <input className="grow" inputMode="decimal" value={newRate} onChange={(e) => setNewRate(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Cotação em R$" aria-label="Cotação da nova moeda" />
          </div>
          {parsedNew && newCode && (
            <span className="muted small">
              1 {newCode} = R$ {newRate} · {formatMoney(sampleAmount(newCode, parsedNew), newCode)} ={" "}
              {formatBRL(toBrlCents(sampleAmount(newCode, parsedNew), newCode, parsedNew))}
            </span>
          )}
          <button className="btn primary small" disabled={!parsedNew || !newCode}>
            Adicionar moeda
          </button>
        </form>
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
