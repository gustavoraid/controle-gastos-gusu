import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back } from "@/hooks/useRoute";
import { deleteExpense, getExpense, saveExpense } from "@/lib/api";
import { addDaysISO, todayISO } from "@/lib/dates";
import { centsToInput, formatBRL, parseAmountToCents } from "@/lib/money";
import { splitForExpense, weightsToPercents } from "@/lib/split";
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

function Form(props: { projectId: string; me: string; members: Member[]; categories: Category[]; existing: Expense | null }) {
  const { projectId, me, members, categories, existing } = props;
  const isMember = members.some((m) => m.userId === me);

  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? (isMember ? me : members[0]?.userId));
  const [date, setDate] = useState(existing?.spentOn ?? todayISO());
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) amountRef.current?.focus();
  }, [existing]);

  const cents = parseAmountToCents(amount);
  const desc = description.trim();
  const lines = cents ? splitForExpense(cents, members, existing?.splits) : [];
  const category = categories.find((c) => c.id === categoryId);
  const pct = existing ? null : weightsToPercents(members);
  const name = (uid: string) => (uid === me ? "Eu" : members.find((m) => m.userId === uid)?.name ?? "?");
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);

  function pickCategory(id: string) {
    // Descrição que veio de sugestão da categoria anterior não faz sentido na nova.
    if (category?.suggestions.some((sg) => sg.text === desc)) setDescription("");
    setCategoryId(categoryId === id ? null : id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents) return toast.err("Digite um valor válido.");
    if (!desc) {
      descRef.current?.focus();
      return toast.err("Escreva uma descrição.");
    }
    setBusy(true);
    try {
      await saveExpense({
        id: existing?.id ?? null,
        projectId,
        description: desc,
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

        <div className="field">
          <span>Categoria</span>
          <div className="cat-grid">
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`cat-pick ${categoryId === c.id ? "active" : ""}`}
                onClick={() => pickCategory(c.id)}
                aria-pressed={categoryId === c.id}
              >
                <span className="emoji-lg">{c.emoji}</span>
                <span className="cat-name">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Descrição</span>
          <input
            ref={descRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={category?.suggestions.length ? "Toque numa sugestão ou escreva" : "Ex.: Supermercado, Luz, Jantar"}
            maxLength={120}
            aria-label="Descrição"
            aria-required="true"
            enterKeyHint="done"
            autoCapitalize="sentences"
          />
          {category && category.suggestions.length > 0 && (
            <div className="chips">
              {category.suggestions.map((sg) => (
                <Chip key={sg.id} active={desc === sg.text} onClick={() => setDescription(sg.text)}>
                  {sg.text}
                </Chip>
              ))}
            </div>
          )}
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

        {members.length > 1 && (
          <p className="muted small split-preview">
            {pct ? `Divisão do projeto (${pct.join("/")})` : "Divisão original desta despesa"}
            {cents ? `: ${lines.map((l) => `${name(l.userId)} ${formatBRL(l.amountCents)}`).join(" · ")}` : ""}
          </p>
        )}

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !cents || !desc}>
            {busy ? "Salvando…" : existing ? "Salvar alterações" : cents ? `Lançar ${formatBRL(cents)}` : "Lançar"}
          </button>
        </div>
      </form>
    </>
  );
}
