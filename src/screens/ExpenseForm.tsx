import { useEffect, useRef, useState, type FormEvent } from "react";
import { Chip, ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back } from "@/hooks/useRoute";
import { deleteExpense, getExpense, newId, saveExpense } from "@/lib/api";
import { addDaysISO, todayISO } from "@/lib/dates";
import { currencyDecimals, formatMoney, minorToInput, parseAmountMinor, toBrlCents } from "@/lib/currency";
import { formatBRL } from "@/lib/money";
import { expenseShares, percentLabels } from "@/lib/split";
import type { Category, Expense, Member, ProjectCurrency } from "@/lib/types";

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
      currencies={proj.data.currencies}
      defaultCurrency={proj.data.project.defaultCurrency}
      categories={proj.data.categories.filter((c) => !c.archived || c.id === existing.data?.categoryId)}
      existing={existing.data}
    />
  );
}

function Form(props: {
  projectId: string;
  me: string;
  members: Member[];
  currencies: ProjectCurrency[];
  defaultCurrency: string;
  categories: Category[];
  existing: Expense | null;
}) {
  const { projectId, me, members, currencies, categories, existing } = props;
  const isMember = members.some((m) => m.userId === me);
  const startCurrency =
    existing?.currency ?? (currencies.some((c) => c.code === props.defaultCurrency) ? props.defaultCurrency : "BRL");

  const [currency, setCurrency] = useState(startCurrency);
  const [amount, setAmount] = useState(existing ? minorToInput(existing.amount, existing.currency) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? (isMember ? me : members[0]?.userId));
  const [date, setDate] = useState(existing?.spentOn ?? todayISO());
  const [busy, setBusy] = useState(false);
  // Fixo enquanto o formulário está aberto: tentar salvar de novo não duplica.
  const [draftId] = useState(newId);
  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) amountRef.current?.focus();
  }, [existing]);

  const rate = currencies.find((c) => c.code === currency)?.rate ?? 1;
  const minor = parseAmountMinor(amount, currency);
  // Saldo e divisão são sempre em reais; "cents" é o valor convertido.
  const cents = minor ? toBrlCents(minor, currency, rate) : null;
  const foreign = currency !== "BRL";
  const desc = description.trim();
  const lines = cents ? expenseShares(cents, members) : [];
  const category = categories.find((c) => c.id === categoryId);
  const pct = percentLabels(members);
  const name = (uid: string) => (uid === me ? "Eu" : members.find((m) => m.userId === uid)?.name ?? "?");
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const dayBefore = addDaysISO(today, -2);

  function pickCategory(id: string) {
    // Descrição que veio de sugestão da categoria anterior não faz sentido na nova.
    if (id !== categoryId && category?.suggestions.some((sg) => sg.text === desc)) setDescription("");
    setCategoryId(id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!minor) {
      return toast.err(
        currencyDecimals(currency) === 0 ? `Digite um valor válido (${currency} não tem centavos).` : "Digite um valor válido.",
      );
    }
    if (!categoryId) return toast.err("Escolha uma categoria.");
    if (!desc) {
      descRef.current?.focus();
      return toast.err("Escreva uma descrição.");
    }
    setBusy(true);
    try {
      await saveExpense({
        id: existing?.id ?? draftId,
        isNew: !existing,
        projectId,
        description: desc,
        amount: minor,
        currency,
        paidBy,
        categoryId,
        spentOn: date,
      });
      haptic();
      toast.ok(existing ? "Despesa atualizada" : `${formatMoney(minor, currency)} lançado`);
      back(`/p/${projectId}`);
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !confirm(`Apagar “${existing.description}” (${formatMoney(existing.amount, existing.currency)})?`)) return;
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
        {currencies.length > 1 && (
          <div className="segmented" aria-label="Moeda">
            {currencies.map((c) => (
              <button type="button" key={c.code} className={currency === c.code ? "active" : ""} onClick={() => setCurrency(c.code)}>
                {c.code === "BRL" ? "R$" : c.code}
              </button>
            ))}
          </div>
        )}
        <label className="amount-field">
          <span className="currency">{foreign ? currency : "R$"}</span>
          <input
            ref={amountRef}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            placeholder={currencyDecimals(currency) === 0 ? "0" : "0,00"}
            aria-label="Valor"
            enterKeyHint="next"
            autoComplete="off"
          />
        </label>
        {foreign && (
          <p className="muted small conversion">
            {cents ? `≈ ${formatBRL(cents)} · ` : ""}1 {currency} = R$ {String(rate).replace(".", ",")}
          </p>
        )}

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
            <Chip active={date === dayBefore} onClick={() => setDate(dayBefore)}>
              Anteontem
            </Chip>
            <input type="date" className={`chip date-chip ${![today, yesterday, dayBefore].includes(date) ? "active" : ""}`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Outra data" />
          </div>
        </div>

        {members.length > 1 && (
          <p className="muted small split-preview">
            Divisão do projeto ({pct.join(" / ")})
            {cents ? `: ${lines.map((l) => `${name(l.userId)} ${formatBRL(l.amountCents)}`).join(" · ")}` : ""}
          </p>
        )}

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !minor || !categoryId || !desc}>
            {busy ? "Salvando…" : existing ? "Salvar alterações" : minor ? `Lançar ${formatMoney(minor, currency)}` : "Lançar"}
          </button>
        </div>
      </form>
    </>
  );
}
