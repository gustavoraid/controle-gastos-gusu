import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateChips } from "@/components/DateChips";
import { Chip, ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back } from "@/hooks/useRoute";
import { deleteExpense, getExpense, newId, saveExpense } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { currencyDecimals, formatMoney, minorToInput, parseAmountMinor, toBrlCents } from "@/lib/currency";
import { formatBRL } from "@/lib/money";
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
  const category = categories.find((c) => c.id === categoryId);

  // Conversão em texto pequeno logo abaixo do valor (só em moeda estrangeira).
  const info: string[] = [];
  if (foreign) {
    const rateText = `1 ${currency} = R$ ${String(rate).replace(".", ",")}`;
    info.push(cents ? `≈ ${formatBRL(cents)} · ${rateText}` : rateText);
  }

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
      <form className="page expense-form compact" onSubmit={submit}>
        <label className="amount-field">
          {currencies.length > 1 ? (
            <button
              type="button"
              className="currency-btn"
              onClick={() => setCurrency(currencies[(currencies.findIndex((c) => c.code === currency) + 1) % currencies.length].code)}
              aria-label={`Moeda: ${currency}. Toque para trocar`}
            >
              {foreign ? currency : "R$"} <span aria-hidden="true">▾</span>
            </button>
          ) : (
            <span className="currency">R$</span>
          )}
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
        {info.length > 0 && (
          <p className="muted small conversion">
            {info.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        )}

        <div className="field">
          <span>Categoria</span>
          <div className="cat-chips" role="group" aria-label="Categoria">
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip cat-chip ${categoryId === c.id ? "active" : ""}`}
              onClick={() => pickCategory(c.id)}
              aria-pressed={categoryId === c.id}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.name}
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
            placeholder={category?.suggestions.length ? "Toque numa sugestão ou escreva" : "Ex.: Jantar, Táxi, Mercado"}
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
          <DateChips value={date} onChange={setDate} />
        </div>

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !minor || !categoryId || !desc}>
            {busy ? "Salvando…" : existing ? "Salvar alterações" : minor ? `Lançar ${formatMoney(minor, currency)}` : "Lançar"}
          </button>
        </div>
      </form>
    </>
  );
}
