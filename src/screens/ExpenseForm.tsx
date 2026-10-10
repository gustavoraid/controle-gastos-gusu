import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Chip, ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back } from "@/hooks/useRoute";
import { deleteExpense, getExpense, saveExpense } from "@/lib/api";
import { addDaysISO, todayISO } from "@/lib/dates";
import { centsToInput, formatBRL, parseAmountToCents } from "@/lib/money";
import { buildSplit, splitByWeights, splitTotal, weightsToPercents, type SplitMode } from "@/lib/split";
import type { Category, Expense, Member } from "@/lib/types";

export function ExpenseForm({ projectId, expenseId, me }: { projectId: string; expenseId: string | null; me: string }) {
  const proj = useProject(projectId);
  const existing = useLoad(() => (expenseId ? getExpense(expenseId) : Promise.resolve(null)), [expenseId]);

  const err = proj.error ?? existing.error;
  if (err) {
    return (
      <>
        <Header title="Despesa" onBack={() => back(`/p/${projectId}`)} />
        <main className="page">
          <ErrorBox message={err} />
        </main>
      </>
    );
  }
  if (!proj.data || (expenseId && !existing.data)) return <Loading />;

  return (
    <Form
      key={expenseId ?? "new"}
      projectId={projectId}
      me={me}
      members={proj.data.members}
      categories={proj.data.categories.filter((c) => !c.archived || c.id === existing.data?.categoryId)}
      existing={existing.data}
    />
  );
}

/** Descobre em que modo uma despesa salva foi dividida, para reabrir igual. */
function detectMode(e: Expense, members: Member[]): SplitMode {
  const same = (mode: SplitMode) => {
    const lines = buildSplit({ mode, totalCents: e.amountCents, paidBy: e.paidBy, members });
    return lines.every((l) => l.amountCents === (e.splits.find((s) => s.userId === l.userId)?.amountCents ?? 0));
  };
  return (["project", "equal", "payer", "other"] as SplitMode[]).find(same) ?? "exact";
}

function Form(props: { projectId: string; me: string; members: Member[]; categories: Category[]; existing: Expense | null }) {
  const { projectId, me, members, categories, existing } = props;
  const isMember = members.some((m) => m.userId === me);

  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? (isMember ? me : members[0]?.userId));
  const [date, setDate] = useState(existing?.spentOn ?? todayISO());
  const [mode, setMode] = useState<SplitMode>(existing ? detectMode(existing, members) : "project");
  const [showSplit, setShowSplit] = useState(existing ? detectMode(existing, members) !== "project" : false);
  const [exact, setExact] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => [m.userId, existing ? centsToInput(existing.splits.find((s) => s.userId === m.userId)?.amountCents ?? 0) : ""]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) amountRef.current?.focus();
  }, [existing]);

  const cents = parseAmountToCents(amount);
  const exactCents = useMemo(
    () => Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, parseAmountToCents(v) ?? 0])),
    [exact],
  );
  const lines = cents ? buildSplit({ mode, totalCents: cents, paidBy, members, exact: exactCents }) : [];
  const exactDiff = cents && mode === "exact" ? cents - splitTotal(lines) : 0;
  const pct = weightsToPercents(members);
  const name = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);

  const modes: { id: SplitMode; label: string }[] = [
    { id: "project", label: `Proporção do projeto (${pct.join("/")})` },
    { id: "equal", label: "Meio a meio" },
    { id: "payer", label: `Só de ${paidBy === me ? "mim" : name(paidBy)}` },
    { id: "other", label: `${paidBy === me ? "Paguei" : name(paidBy) + " pagou"} tudo pelo outro` },
    { id: "exact", label: "Valores exatos" },
  ];
  // Com uma pessoa só, "pelo outro" não faz sentido.
  const visibleModes = members.length > 1 ? modes : modes.filter((m) => m.id !== "other");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents) return toast.err("Digite um valor válido.");
    if (exactDiff !== 0) return toast.err(`A divisão está ${exactDiff > 0 ? "faltando" : "passando"} ${formatBRL(Math.abs(exactDiff))}.`);
    const cat = categories.find((c) => c.id === categoryId);
    setBusy(true);
    try {
      await saveExpense({
        id: existing?.id ?? null,
        projectId,
        description: description.trim() || cat?.name || "Despesa",
        amountCents: cents,
        paidBy,
        categoryId,
        spentOn: date,
        splits: lines,
      });
      haptic();
      toast.ok(existing ? "Despesa atualizada" : `${formatBRL(cents)} lançado`);
      back(`/p/${projectId}`);
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !confirm(`Apagar “${existing.description}” (${formatBRL(existing.amountCents)})?`)) return;
    setBusy(true);
    try {
      await deleteExpense(existing.id);
      toast.ok("Despesa apagada");
      back(`/p/${projectId}`);
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  const deleteBtn = existing ? (
    <button className="icon-btn danger" aria-label="Apagar despesa" onClick={remove} disabled={busy}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  ) : undefined;

  return (
    <>
      <Header title={existing ? "Editar despesa" : "Nova despesa"} onBack={() => back(`/p/${projectId}`)} action={deleteBtn} />
      <form className="page expense-form" onSubmit={submit}>
        <label className="amount-field">
          <span className="currency">R$</span>
          <input
            ref={amountRef}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Valor"
            enterKeyHint="next"
            autoComplete="off"
          />
        </label>

        <input
          className="desc-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={categories.find((c) => c.id === categoryId)?.name ?? "Descrição (opcional)"}
          maxLength={120}
          aria-label="Descrição"
          enterKeyHint="done"
        />

        <div className="field">
          <span>Categoria</span>
          <div className="cat-grid">
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`cat-pick ${categoryId === c.id ? "active" : ""}`}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                aria-pressed={categoryId === c.id}
              >
                <span className="emoji-lg">{c.emoji}</span>
                <span className="cat-name">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {members.length > 1 && (
          <div className="field">
            <span>Quem pagou</span>
            <div className="segmented">
              {members.map((m) => (
                <button type="button" key={m.userId} className={paidBy === m.userId ? "active" : ""} onClick={() => setPaidBy(m.userId)}>
                  {m.userId === me ? "Eu" : m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span>Quando</span>
          <div className="chips">
            <Chip active={date === today} onClick={() => setDate(today)}>
              Hoje
            </Chip>
            <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
              Ontem
            </Chip>
            <input type="date" className={`chip date-chip ${date !== today && date !== yesterday ? "active" : ""}`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Outra data" />
          </div>
        </div>

        <div className="field">
          <button type="button" className="split-summary" onClick={() => setShowSplit(!showSplit)} aria-expanded={showSplit}>
            <span>
              <span className="muted small">Divisão</span>
              <strong>{visibleModes.find((m) => m.id === mode)?.label}</strong>
            </span>
            <span className="muted">{showSplit ? "▲" : "alterar ▼"}</span>
          </button>

          {showSplit && (
            <div className="split-options">
              <div className="chips">
                {visibleModes.map((m) => (
                  <Chip key={m.id} active={mode === m.id} onClick={() => {
                    if (m.id === "exact" && cents && Object.values(exactCents).every((v) => v === 0)) {
                      const base = splitByWeights(cents, members);
                      setExact(Object.fromEntries(base.map((l) => [l.userId, centsToInput(l.amountCents)])));
                    }
                    setMode(m.id);
                  }}>
                    {m.label}
                  </Chip>
                ))}
              </div>
              {mode === "exact" && (
                <div className="stack-sm">
                  {members.map((m) => (
                    <label key={m.userId} className="row between exact-row">
                      <span>{m.userId === me ? "Eu" : m.name}</span>
                      <input
                        value={exact[m.userId] ?? ""}
                        onChange={(e) => setExact({ ...exact, [m.userId]: e.target.value.replace(/[^\d.,]/g, "") })}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </label>
                  ))}
                  {exactDiff !== 0 && (
                    <p className="text-err small">
                      {exactDiff > 0 ? "Faltam" : "Sobram"} {formatBRL(Math.abs(exactDiff))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {cents ? (
            <p className="muted small split-preview">
              {lines.map((l) => `${l.userId === me ? "Eu" : name(l.userId)} ${formatBRL(l.amountCents)}`).join(" · ")}
            </p>
          ) : null}
        </div>

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !cents}>
            {busy ? "Salvando…" : existing ? "Salvar alterações" : cents ? `Lançar ${formatBRL(cents)}` : "Lançar"}
          </button>
        </div>
      </form>
    </>
  );
}
