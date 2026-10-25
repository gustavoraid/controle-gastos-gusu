import { useState } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { SortableList } from "@/components/SortableList";
import { Avatar, ErrorBox, Header, Loading, toast } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { back, go } from "@/hooks/useRoute";
import { applySettings, deleteProject, listAllForBalance, ratesOf, type Rates, updateProject } from "@/lib/api";
import { computeNets, inBrl, suggestTransfers } from "@/lib/balances";
import {
  CURRENCIES,
  MAX_EXTRA_CURRENCIES,
  currencyDecimals,
  currencyName,
  formatMoney,
  parseRate,
  toBrlCents,
} from "@/lib/currency";
import { firstGrapheme } from "@/lib/emoji";
import { formatBRL } from "@/lib/money";
import { moveItem } from "@/lib/order";
import {
  draftFrom,
  hasChanges,
  planChanges,
  validateDraft,
  type CategoryDraft,
  type SettingsBase,
  type SettingsDraft,
} from "@/lib/settingsDraft";
import { parseWeight, percentLabels } from "@/lib/split";
import { PROJECT_TYPES, type Member, type Project } from "@/lib/types";

type SetDraft = (patch: Partial<SettingsDraft>) => void;

export function ProjectSettings({ projectId }: { projectId: string; me: string }) {
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
  return <SettingsForm key={projectId} initial={proj.data} />;
}

/**
 * Tudo o que se edita aqui fica num rascunho até o "Salvar" do topo. A base é o
 * que veio do banco ao abrir a tela (o tempo real não mexe no que está sendo editado).
 */
function SettingsForm({ initial }: { initial: SettingsBase }) {
  const [base] = useState(initial);
  const [draft, setDraftState] = useState(() => draftFrom(initial));
  const [saving, setSaving] = useState(false);
  const set: SetDraft = (patch) => setDraftState((d) => ({ ...d, ...patch }));
  const { project, members } = base;

  const error = validateDraft(draft);
  const plan = error ? null : planChanges(base, draft);
  const dirty = error !== null || (plan !== null && hasChanges(plan));

  function leave() {
    if (dirty && !confirm("Sair sem salvar as alterações?")) return;
    back(`/p/${project.id}`);
  }

  async function save() {
    if (error) return toast.err(error);
    if (!plan || !hasChanges(plan)) return;
    setSaving(true);
    try {
      if (plan.recalc) {
        const rates = ratesOf(base.currencies);
        const ok = await confirmRecalc({
          projectId: project.id,
          members,
          rates,
          nextMembers: members.map((m, i) => ({ ...m, weight: parseWeight(draft.weights[i]) ?? 0 })),
          nextRates: { ...rates, ...Object.fromEntries(plan.setRates.map((r) => [r.code, r.rate])) },
          what: [plan.weights && "a nova proporção", plan.setRates.length > 0 && "a nova cotação"].filter(Boolean).join(" e "),
        });
        if (!ok) return setSaving(false);
      }
      await applySettings(project.id, plan, project.defaultCurrency);
      toast.ok("Ajustes salvos");
      back(`/p/${project.id}`);
    } catch (err) {
      toast.err((err as Error).message);
      setSaving(false);
    }
  }

  const saveBtn = (
    <button className="topbar-save" onClick={save} disabled={!dirty || saving}>
      {saving ? "Salvando…" : "Salvar"}
    </button>
  );

  return (
    <>
      <Header title="Ajustes do projeto" onBack={leave} action={saveBtn} />
      <main className="page stack">
        {error && dirty && <p className="text-err small">{error}</p>}
        <ProjectInfo draft={draft} set={set} />
        <Proportions members={members} draft={draft} set={set} />
        <Currencies draft={draft} set={set} />
        <Categories draft={draft} set={set} />
        <DangerZone project={project} />
      </main>
    </>
  );
}

function ProjectInfo({ draft, set }: { draft: SettingsDraft; set: SetDraft }) {
  return (
    <section className="card stack-sm">
      <h2 className="card-title">Projeto</h2>
      <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} aria-label="Nome do projeto" />
      <EmojiPicker value={draft.emoji} onChange={(emoji) => set({ emoji })} />
      <div className="segmented" aria-label="Tipo do projeto">
        {PROJECT_TYPES.map((t) => (
          <button type="button" key={t.id} className={draft.type === t.id ? "active" : ""} onClick={() => set({ type: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      {draft.type === "viagem" && (
        <label className="row between gap-sm">
          <span>
            Dias de viagem
            <span className="muted small block">Para o Resumo mostrar o gasto por dia</span>
          </span>
          <input
            className="days-input"
            value={draft.days}
            onChange={(e) => set({ days: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            placeholder="—"
            maxLength={3}
            aria-label="Dias de viagem"
          />
        </label>
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
  if (all.expenses.length === 0) return true;
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

function Proportions(props: { members: Member[]; draft: SettingsDraft; set: SetDraft }) {
  const { members, draft, set } = props;
  const fmt = (w: number) => String(w).replace(".", ",");
  const inputs = draft.weights;
  const parsed = inputs.map(parseWeight);
  const valid = parsed.every((w) => w !== null) && parsed.some((w) => (w ?? 0) > 0);
  const labels = percentLabels(members.map((m, i) => ({ userId: m.userId, weight: parsed[i] ?? 0 })));

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
            <Avatar name={m.name} size={28} /> {m.name}
          </span>
          <span className="row gap-sm">
            <input
              className="pct-input"
              inputMode="decimal"
              value={inputs[i]}
              onChange={(e) =>
                set({ weights: inputs.map((v, k) => (k === i ? e.target.value.replace(/[^\d.,]/g, "") : v)) })
              }
              aria-label={`Peso de ${m.name}`}
            />
            <span className="muted pct-label">{valid ? labels[i] : "—"}</span>
          </span>
        </label>
      ))}
      {members.length === 2 && (
        <div className="chips">
          {PRESETS.map(([a, b]) => (
            <button key={`${a}-${b}`} type="button" className="chip" onClick={() => set({ weights: [fmt(a), fmt(b)] })}>
              {a} : {b}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Exemplo para conferir a cotação: 100 unidades, ou 10.000 para moedas "pequenas". */
function sampleAmount(code: string, rate: number): number {
  const units = rate < 0.1 ? 10_000 : 100;
  return units * 10 ** currencyDecimals(code);
}

function Currencies({ draft, set }: { draft: SettingsDraft; set: SetDraft }) {
  const extras = draft.currencies;
  const available = CURRENCIES.filter((c) => c.code !== "BRL" && !extras.some((pc) => pc.code === c.code));
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const code = available.some((c) => c.code === newCode) ? newCode : (available[0]?.code ?? "");
  const parsedNew = parseRate(newRate);

  function remove(c: string) {
    set({
      currencies: extras.filter((x) => x.code !== c),
      defaultCurrency: draft.defaultCurrency === c ? "BRL" : draft.defaultCurrency,
    });
  }

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
          const typed = parseRate(c.rate);
          const sample = typed ? sampleAmount(c.code, typed) : 0;
          return (
            <li key={c.code} className="stack-sm">
              <div className="row between">
                <span>
                  <strong>{c.code}</strong> {currencyName(c.code)}
                </span>
                <button className="btn small ghost" onClick={() => remove(c.code)}>
                  Remover
                </button>
              </div>
              <label className="row gap-sm">
                <span className="muted small">1 {c.code} = R$</span>
                <input
                  className="grow"
                  inputMode="decimal"
                  value={c.rate}
                  onChange={(e) =>
                    set({
                      currencies: extras.map((x) =>
                        x.code === c.code ? { ...x, rate: e.target.value.replace(/[^\d.,]/g, "") } : x,
                      ),
                    })
                  }
                  aria-label={`Cotação do ${c.code}`}
                />
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

      {extras.length > 0 && (
        <div className="field">
          <span>Moeda que vem selecionada ao lançar</span>
          <div className="segmented">
            {["BRL", ...extras.map((c) => c.code)].map((c) => (
              <button
                type="button"
                key={c}
                className={draft.defaultCurrency === c ? "active" : ""}
                onClick={() => set({ defaultCurrency: c })}
              >
                {c === "BRL" ? "R$" : c}
              </button>
            ))}
          </div>
        </div>
      )}

      {extras.length < MAX_EXTRA_CURRENCIES && available.length > 0 && (
        <div className="stack-sm">
          <div className="row gap-sm">
            <select className="currency-select" value={code} onChange={(e) => setNewCode(e.target.value)} aria-label="Nova moeda">
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <input
              className="grow"
              inputMode="decimal"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="Cotação em R$"
              aria-label="Cotação da nova moeda"
            />
          </div>
          {parsedNew && code && (
            <span className="muted small">
              1 {code} = R$ {newRate} · {formatMoney(sampleAmount(code, parsedNew), code)} ={" "}
              {formatBRL(toBrlCents(sampleAmount(code, parsedNew), code, parsedNew))}
            </span>
          )}
          <button
            type="button"
            className="btn ghost small"
            disabled={!parsedNew || !code}
            onClick={() => {
              set({ currencies: [...extras, { code, rate: newRate }] });
              setNewRate("");
            }}
          >
            Adicionar moeda
          </button>
        </div>
      )}
    </section>
  );
}

let newKey = 0;

function Categories({ draft, set }: { draft: SettingsDraft; set: SetDraft }) {
  const cats = draft.categories;
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏷️");
  const [open, setOpen] = useState<string | null>(null);

  const update = (key: string, patch: Partial<CategoryDraft>) =>
    set({ categories: cats.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  function add() {
    if (!newName.trim()) return;
    const cat: CategoryDraft = {
      key: `novo-${++newKey}`,
      id: null,
      name: newName.trim(),
      emoji: newEmoji || "🏷️",
      archived: false,
      nonRecurring: false,
      suggestions: [],
    };
    set({ categories: [...cats, cat] });
    setNewName("");
  }

  return (
    <section className="card stack-sm">
      <h2 className="card-title">Categorias e descrições sugeridas</h2>
      <p className="muted small">
        Arraste pela alça ≡ para mudar a ordem (é a ordem dos botões ao lançar). As sugestões aparecem como atalho ao
        lançar uma despesa na categoria.{draft.type === "casa" && " Marque como “não recorrente” o que é gasto pontual (reforma, compra grande): o Resumo do mês mostra separado."}
      </p>
      <SortableList
        className="cat-edit-list"
        items={cats}
        getId={(c) => c.key}
        onMove={(from, to) => set({ categories: moveItem(cats, from, to) })}
        renderItem={(c, handle) => (
          <div className={`stack-sm ${c.archived ? "dim" : ""}`}>
            <div className="cat-edit-row">
              {handle}
              <IconInput value={c.emoji} onChange={(emoji) => update(c.key, { emoji })} label={`Ícone de ${c.name}`} />
              <input
                className="grow"
                value={c.name}
                onChange={(e) => update(c.key, { name: e.target.value })}
                aria-label="Nome da categoria"
                maxLength={40}
              />
              <button className="btn small ghost" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key}>
                {c.suggestions.length} {open === c.key ? "▲" : "▼"}
              </button>
            </div>
            {draft.type === "casa" && c.nonRecurring && open !== c.key && (
              <span className="muted small cat-tag">Não recorrente</span>
            )}
            {open === c.key && (
              <SuggestionsEditor
                category={c}
                showRecurrence={draft.type === "casa"}
                onChange={(patch) => update(c.key, patch)}
                onDelete={() => set({ categories: cats.filter((x) => x.key !== c.key) })}
              />
            )}
          </div>
        )}
      />
      <div className="row gap-sm">
        <IconInput value={newEmoji} onChange={setNewEmoji} label="Ícone da nova categoria" />
        <input
          className="grow"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova categoria"
          maxLength={40}
        />
        <button type="button" className="btn ghost small" disabled={!newName.trim()} onClick={add}>
          Adicionar
        </button>
      </div>
    </section>
  );
}

/** Um único ícone: um emoji (mesmo os de vários códigos, como bandeiras) ou uma letra. */
function IconInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      className="emoji-input"
      value={value}
      onChange={(e) => {
        // O que acabou de ser digitado vem depois do ícone atual: fica com o último caractere.
        const typed = e.target.value.startsWith(value) ? e.target.value.slice(value.length) : e.target.value;
        const g = firstGrapheme(typed);
        onChange(g ?? "");
      }}
      aria-label={label}
      autoComplete="off"
    />
  );
}

function SuggestionsEditor(props: {
  category: CategoryDraft;
  /** Casa: marcar como não recorrente (o Resumo mostra separado). */
  showRecurrence: boolean;
  onChange: (patch: Partial<CategoryDraft>) => void;
  onDelete: () => void;
}) {
  const { category: c, onChange } = props;
  const [text, setText] = useState("");

  function add() {
    const t = text.trim();
    if (!t || c.suggestions.some((s) => s.text.trim() === t)) return setText("");
    onChange({ suggestions: [...c.suggestions, { key: `novo-${++newKey}`, id: null, text: t }] });
    setText("");
  }

  return (
    <div className="suggestions-editor">
      {props.showRecurrence && (
        <div className="segmented small" aria-label="Tipo de gasto">
          <button type="button" className={c.nonRecurring ? "" : "active"} onClick={() => onChange({ nonRecurring: false })}>
            Recorrente
          </button>
          <button type="button" className={c.nonRecurring ? "active" : ""} onClick={() => onChange({ nonRecurring: true })}>
            Não recorrente
          </button>
        </div>
      )}
      {c.suggestions.length === 0 ? (
        <p className="muted small">Nenhuma sugestão ainda.</p>
      ) : (
        <div className="chips">
          {c.suggestions.map((sg) => (
            <span key={sg.key} className="chip removable">
              {sg.text}
              <button
                type="button"
                aria-label={`Remover ${sg.text}`}
                onClick={() => onChange({ suggestions: c.suggestions.filter((s) => s.key !== sg.key) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row gap-sm">
        <input
          className="grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova sugestão"
          maxLength={120}
        />
        <button type="button" className="btn ghost small" disabled={!text.trim()} onClick={add}>
          Adicionar
        </button>
      </div>
      <div className="row gap-sm">
        <button className="btn small ghost" onClick={() => onChange({ archived: !c.archived })}>
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
      <p className="muted small">Estas ações valem na hora, sem o “Salvar”.</p>
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
