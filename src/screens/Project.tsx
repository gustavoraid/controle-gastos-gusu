import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SortableList } from "@/components/SortableList";
import { Avatar, ErrorBox, Header, Loading, Money, PERSON_COLORS, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back, go } from "@/hooks/useRoute";
import { deleteSettlement, listActivity, listActivityMonths, setSortKeys } from "@/lib/api";
import { suggestTransfers } from "@/lib/balances";
import { dayLabel, monthLabel, monthRange, navigableMonths, shiftMonth, shortDayLabel, stepMonth, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { formatBRL } from "@/lib/money";
import { expenseShares, percentLabels } from "@/lib/split";
import { splitByRecurrence, type CategoryGroup } from "@/lib/summary";
import { swipeStep } from "@/lib/swipe";
import { perDayCents } from "@/lib/trip";
import { moveItem, reorderKeys } from "@/lib/order";
import { getViewMonth, setLastProject, setViewMonth } from "@/lib/storage";
import type { Category, Expense, Member, Settlement } from "@/lib/types";

// key: ordem dentro do dia (maior = mais acima). Despesa usa sort_key; acerto, o instante em que foi criado.
type Item = { kind: "e"; date: string; key: number; e: Expense } | { kind: "s"; date: string; key: number; s: Settlement };

export function ProjectScreen({ id, me }: { id: string; me: string }) {
  const [month, setMonthState] = useState(() => getViewMonth(id) ?? todayISO().slice(0, 7));
  const setMonth = (m: string) => {
    setMonthState(m);
    setViewMonth(id, m);
  };
  const [tab, setTab] = useState<"lista" | "resumo">("lista");
  const [reordering, setReordering] = useState(false);
  const reloadActivity = useRef<() => void>(undefined);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const proj = useProject(id, () => reloadActivity.current?.());
  // Viagem mostra tudo de uma vez (sem navegação por mês); os outros tipos, mês a mês.
  const type = proj.data?.project.type;
  const isTrip = type === "viagem";
  // Casa: a navegação pula meses sem lançamento e a lista não agrupa por dia (data na linha).
  const isHome = type === "casa";
  const activity = useLoad(
    () => (type ? listActivity(id, isTrip ? undefined : monthRange(month)) : Promise.resolve(null)),
    [id, month, type],
  );
  const activeMonths = useLoad(() => (isHome ? listActivityMonths(id) : Promise.resolve(null)), [id, isHome]);
  reloadActivity.current = () => {
    activity.reload();
    activeMonths.reload();
  };

  useEffect(() => setLastProject(id), [id]);

  const data = proj.data;
  const names = useMemo(() => new Map(data?.members.map((m) => [m.userId, m.name]) ?? []), [data]);
  const cats = useMemo(() => new Map(data?.categories.map((c) => [c.id, c]) ?? []), [data]);
  const colors = useMemo(
    () => new Map(data?.members.map((m, i) => [m.userId, PERSON_COLORS[i % PERSON_COLORS.length]]) ?? []),
    [data],
  );

  if (proj.error) {
    return (
      <>
        <Header title="Projeto" onBack={() => back("/")} />
        <main className="page">
          <ErrorBox message={proj.error} onRetry={proj.reload} />
        </main>
      </>
    );
  }
  if (!data) return <Loading />;

  const { project, members, balances } = data;
  const months = activeMonths.data ? navigableMonths(activeMonths.data, todayISO().slice(0, 7)) : null;
  const prevMonth = months ? stepMonth(months, month, -1) : shiftMonth(month, -1);
  const nextMonth = months ? stepMonth(months, month, 1) : shiftMonth(month, 1);
  const settingsBtn = (
    <button className="icon-btn" aria-label="Ajustes do projeto" onClick={() => go(`/p/${id}/config`)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M10.3 3h3.4l.5 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.3-.9-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.9-1.7-2.9 1.8-1.6v-2.2L4.1 8.3l1.7-2.9 2.3.9 1.7-.9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );

  return (
    <>
      <Header title={`${project.emoji} ${project.name}`} onBack={() => back("/")} action={settingsBtn} />
      <main
        className="page with-fab"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          // Arrastar para o lado troca o mês (onde há navegação por mês e fora do modo reordenar).
          if (!start || isTrip || reordering) return;
          const t = e.changedTouches[0];
          const step = swipeStep(start, { x: t.clientX, y: t.clientY }, window.innerWidth);
          const target = step === 1 ? nextMonth : step === -1 ? prevMonth : null;
          if (target) setMonth(target);
        }}
      >

        {!isTrip && (
        <nav className="month-nav">
          <button className="icon-btn" aria-label="Mês anterior" disabled={!prevMonth} onClick={() => prevMonth && setMonth(prevMonth)}>
            ‹
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="icon-btn" aria-label="Próximo mês" disabled={!nextMonth} onClick={() => nextMonth && setMonth(nextMonth)}>
            ›
          </button>
        </nav>
        )}

        <div className="tabs-row">
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={tab === "lista"} className={tab === "lista" ? "active" : ""} onClick={() => setTab("lista")} disabled={reordering}>
              Lançamentos
            </button>
            <button role="tab" aria-selected={tab === "resumo"} className={tab === "resumo" ? "active" : ""} onClick={() => setTab("resumo")} disabled={reordering}>
              {isTrip ? "Resumo" : "Resumo do mês"}
            </button>
          </div>
        </div>

        {activity.error && <ErrorBox message={activity.error} onRetry={activity.reload} />}
        {!activity.data && !activity.error && <Loading />}
        {activity.data && tab === "lista" && (
          <ActivityList
            me={me}
            projectId={id}
            members={members}
            names={names}
            colors={colors}
            cats={cats}
            expenses={activity.data.expenses}
            settlements={activity.data.settlements}
            emptyText={isTrip ? "Nada lançado nesta viagem ainda." : "Nada lançado neste mês."}
            groupByDay={!isHome}
            reordering={reordering}
            onStartReorder={() => setReordering(true)}
            onExitReorder={() => setReordering(false)}
            onChanged={() => {
              reloadActivity.current?.();
              proj.reload();
            }}
          />
        )}
        {activity.data && tab === "resumo" && (
          <>
            {/* saldo é de todo o projeto (não só do mês): por isso "Saldo geral" */}
            <BalanceBanner
              me={me}
              members={members}
              balances={balances}
              label={isTrip ? "Saldo da viagem" : "Saldo geral"}
              onSettle={() => go(`/p/${id}/acertar`)}
            />
            <MonthSummary
              members={members}
              cats={cats}
              expenses={activity.data.expenses}
              isTrip={isTrip}
              tripDays={isTrip ? project.tripDays : null}
              splitRecurrence={isHome}
              onSettings={() => go(`/p/${id}/config`)}
            />
          </>
        )}
      </main>

      {!reordering && (
        <button className="fab" onClick={() => go(`/p/${id}/add`)} aria-label="Adicionar despesa">
          <span aria-hidden="true">+</span> Despesa
        </button>
      )}
    </>
  );
}

function BalanceBanner(props: {
  me: string;
  members: Member[];
  balances: Record<string, number>;
  label: string;
  onSettle: () => void;
}) {
  const { me, members, balances } = props;
  const name = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
  const mine = suggestTransfers(balances).filter((t) => t.from === me || t.to === me);
  const pct = percentLabels(members);

  return (
    <section className="balance-banner">
      <span className="muted small">{props.label}</span>
      {mine.length === 0 ? (
        <p className="balance-title">Tudo certo entre {members.map((m) => m.name).join(" e ")} ✨</p>
      ) : (
        mine.map((t) => (
          <p key={t.from + t.to} className="balance-title">
            {name(t.from)} deve <Money cents={t.amountCents} tone={t.to === me ? "pos" : "neg"} /> a {name(t.to)}
          </p>
        ))
      )}
      <div className="row between">
        <span className="muted small">
          Divisão padrão: {members.map((m, i) => `${m.name} ${pct[i]}`).join(" · ")}
        </span>
        {mine.length > 0 && (
          <button className="btn small ghost" onClick={props.onSettle}>
            Acertar
          </button>
        )}
      </div>
    </section>
  );
}

function ActivityList(props: {
  me: string;
  projectId: string;
  members: Member[];
  names: Map<string, string>;
  colors: Map<string, string>;
  cats: Map<string, Category>;
  expenses: Expense[];
  settlements: Settlement[];
  emptyText: string;
  /** false: lista corrida, com a data em cada linha e sem reordenar (Casa). */
  groupByDay: boolean;
  reordering: boolean;
  /** ⇅ no cabeçalho de um dia: entra no modo reordenar (vale para todos os dias). */
  onStartReorder: () => void;
  onExitReorder: () => void;
  onChanged: () => void;
}) {
  const { me, names, cats } = props;
  // Modo reordenar: rascunho da ordem de cada dia (data → despesas de cima para baixo).
  const [draft, setDraft] = useState<Record<string, Expense[]>>({});
  const [saving, setSaving] = useState(false);
  const items: Item[] = [
    ...props.expenses.map((e): Item => ({ kind: "e", date: e.spentOn, key: e.sortKey, e })),
    ...props.settlements.map((s): Item => ({ kind: "s", date: s.settledOn, key: Date.parse(s.createdAt) / 1000, s })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.key - a.key);

  const groups: { date: string; items: Item[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last?.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }

  async function removeSettlement(s: Settlement) {
    const msg = `Apagar o pagamento de ${formatBRL(s.amountCents)} de ${names.get(s.fromUser)} para ${names.get(s.toUser)}?`;
    if (!confirm(msg)) return;
    try {
      await deleteSettlement(s.id);
      toast.ok("Pagamento apagado");
      props.onChanged();
    } catch (err) {
      toast.err((err as Error).message);
    }
  }

  const dayExpenses = (g: { items: Item[] }) => g.items.flatMap((it) => (it.kind === "e" ? [it.e] : []));

  // Ao entrar no modo, o rascunho começa com a ordem atual de cada dia.
  useEffect(() => {
    if (props.reordering) setDraft(Object.fromEntries(groups.map((g) => [g.date, dayExpenses(g)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.reordering]);

  if (items.length === 0) {
    return (
      <div className="empty">
        <p className="empty-emoji">🧾</p>
        <p>{props.emptyText}</p>
      </div>
    );
  }

  async function finishReorder() {
    const changes = groups.flatMap((g) => {
      const original = dayExpenses(g);
      const next = draft[g.date] ?? original;
      return reorderKeys(
        original.map((e) => ({ id: e.id, key: e.sortKey })),
        next.map((e) => e.id),
      );
    });
    if (changes.length === 0) return props.onExitReorder();
    setSaving(true);
    try {
      await setSortKeys(changes);
      toast.ok("Ordem salva");
      props.onExitReorder();
      props.onChanged();
    } catch (err) {
      toast.err((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const row = (e: Expense, handle?: ReactNode) => (
    <ExpenseRow e={e} me={me} names={names} color={props.colors.get(e.paidBy)} cat={e.categoryId ? cats.get(e.categoryId) : undefined} projectId={props.projectId} handle={handle} />
  );

  if (props.reordering) {
    return (
      <div className="activity reordering">
        <p className="muted small">Arraste pela alça ≡. As despesas só mudam de posição dentro do próprio dia.</p>
        {groups.map((g) => {
          const exp = draft[g.date] ?? dayExpenses(g);
          if (exp.length === 0) return null;
          return (
            <section key={g.date}>
              <h2 className="day-label">{dayLabel(g.date)}</h2>
              {exp.length > 1 ? (
                // Um SortableList por dia: o arrasto não atravessa dias (não muda data).
                <SortableList
                  className="list"
                  items={exp}
                  getId={(e) => e.id}
                  onMove={(from, to) => setDraft({ ...draft, [g.date]: moveItem(exp, from, to) })}
                  renderItem={(e, handle) => row(e, handle)}
                />
              ) : (
                <ul className="list">
                  <li>{row(exp[0], <span className="drag-handle off" aria-hidden="true" />)}</li>
                </ul>
              )}
            </section>
          );
        })}
        <div className="reorder-bar">
          <button className="btn ghost grow" onClick={props.onExitReorder} disabled={saving}>
            Cancelar
          </button>
          <button className="btn primary grow" onClick={finishReorder} disabled={saving}>
            {saving ? "Salvando…" : "Concluir"}
          </button>
        </div>
      </div>
    );
  }

  const day = (date: string) => (props.groupByDay ? undefined : shortDayLabel(date));
  const renderItem = (it: Item) =>
    it.kind === "e" ? (
      <ExpenseRow key={it.e.id} e={it.e} me={me} names={names} color={props.colors.get(it.e.paidBy)} cat={it.e.categoryId ? cats.get(it.e.categoryId) : undefined} projectId={props.projectId} day={day(it.date)} />
    ) : (
      <li key={it.s.id}>
        <button className="list-item compact" onClick={() => removeSettlement(it.s)}>
          <span className="cat-badge sm settle">💸</span>
          <span className="grow min0">
            <strong className="ellipsis">Acerto de contas</strong>
            <span className="payer small">
              <Avatar name={names.get(it.s.fromUser) ?? "?"} size={16} color={props.colors.get(it.s.fromUser)} />
              {names.get(it.s.fromUser)} → {names.get(it.s.toUser)}
              {day(it.date) && <> · {day(it.date)}</>}
            </span>
          </span>
          <span className="amount-col">
            <Money cents={it.s.amountCents} />
          </span>
        </button>
      </li>
    );

  if (!props.groupByDay) {
    return (
      <div className="activity">
        <ul className="list">{items.map(renderItem)}</ul>
      </div>
    );
  }

  return (
    <div className="activity">
      {groups.map((g) => (
        <section key={g.date}>
          <div className="day-head">
            <h2 className="day-label">{dayLabel(g.date)}</h2>
            {dayExpenses(g).length > 1 && (
              <button className="reorder-day" aria-label={`Reordenar despesas (${dayLabel(g.date)})`} onClick={props.onStartReorder}>
                ⇅ Reordenar
              </button>
            )}
          </div>
          <ul className="list">{g.items.map(renderItem)}</ul>
        </section>
      ))}
    </div>
  );
}

function ExpenseRow(props: {
  e: Expense;
  me: string;
  names: Map<string, string>;
  color?: string;
  cat?: Category;
  projectId: string;
  /** Data na própria linha (lista sem agrupamento por dia). */
  day?: string;
  /** Alça de arrastar: quando presente, a linha está no modo "Reordenar" (sem abrir a despesa). */
  handle?: ReactNode;
}) {
  const { e, names, cat } = props;
  const payerName = names.get(e.paidBy) ?? "?";
  const content = (
    <>
        {props.handle}
        <span className="cat-badge sm">{cat?.emoji ?? "📦"}</span>
        <span className="grow min0">
          <strong className="ellipsis">{e.description}</strong>
          {/* bolinha com a inicial na cor da pessoa: dá para ver quem pagou de relance */}
          <span className="payer small">
            <Avatar name={payerName} size={16} color={props.color} />
            {payerName}
            {props.day && <> · {props.day}</>}
          </span>
        </span>
        <span className="amount-col">
          <span className="money">{formatMoney(e.amount, e.currency)}</span>
          {e.currency !== "BRL" && <span className="muted small">≈ {formatBRL(e.amountCents)}</span>}
        </span>
    </>
  );

  // No modo reordenar o <li> vem do SortableList; fora dele, a linha abre a despesa.
  if (props.handle) return <div className="list-item compact reorder">{content}</div>;
  return (
    <li>
      <button className="list-item compact" onClick={() => go(`/p/${props.projectId}/add?e=${e.id}`)}>
        {content}
      </button>
    </li>
  );
}

function MonthSummary(props: {
  members: Member[];
  cats: Map<string, Category>;
  expenses: Expense[];
  isTrip: boolean;
  tripDays: number | null;
  /** Casa: gastos de categorias não recorrentes aparecem separados. */
  splitRecurrence: boolean;
  onSettings: () => void;
}) {
  const { members, cats, expenses, tripDays } = props;
  const total = expenses.reduce((acc, e) => acc + e.amountCents, 0);

  if (expenses.length === 0) {
    return (
      <div className="empty">
        <p className="empty-emoji">📊</p>
        <p>Sem despesas neste mês.</p>
      </div>
    );
  }

  const foreign = new Map<string, number>();
  for (const e of expenses) if (e.currency !== "BRL") foreign.set(e.currency, (foreign.get(e.currency) ?? 0) + e.amount);
  const foreignTotals = [...foreign.entries()];

  const groups = splitByRecurrence(expenses, (id) => props.splitRecurrence && !!cats.get(id)?.nonRecurring);
  const split = groups.nonRecurring.total > 0;

  const people = members.map((m) => ({
    m,
    paid: expenses.filter((e) => e.paidBy === m.userId).reduce((acc, e) => acc + e.amountCents, 0),
    share: expenses.reduce(
      (acc, e) => acc + (expenseShares(e.amountCents, members).find((s) => s.userId === m.userId)?.amountCents ?? 0),
      0,
    ),
  }));

  return (
    <div className="stack">
      <section className="total-card">
        <span className="muted">{props.isTrip ? "Total da viagem" : "Total gasto no mês"}</span>
        <span className="money big">{formatBRL(total)}</span>
        <span className="muted small">{expenses.length} despesa{expenses.length > 1 ? "s" : ""}</span>
        {tripDays && (
          <span className="per-day">
            <strong>{formatBRL(perDayCents(total, tripDays))}</strong> por dia · {tripDays} dia{tripDays > 1 ? "s" : ""}
          </span>
        )}
        {props.isTrip && !tripDays && (
          <button type="button" className="btn link small trip-days-hint" onClick={props.onSettings}>
            Informe os dias da viagem nos ajustes para ver o gasto por dia
          </button>
        )}
        {split && (
          <span className="recurrence-split small">
            <span>
              Recorrentes <strong>{formatBRL(groups.recurring.total)}</strong>
            </span>
            <span>
              Não recorrentes <strong>{formatBRL(groups.nonRecurring.total)}</strong>
            </span>
          </span>
        )}
        {foreignTotals.length > 0 && (
          <span className="muted small">
            Inclui {foreignTotals.map(([code, amt]) => formatMoney(amt, code)).join(" e ")} convertidos pela cotação do projeto
          </span>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Por pessoa</h2>
        <table className="people-table">
          <thead>
            <tr>
              <th />
              <th>Pagou</th>
              <th>Parte dele(a)</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ m, paid, share }, i) => (
              <tr key={m.userId}>
                <td>
                  <span className="row gap-sm">
                    <Avatar name={m.name} size={24} color={PERSON_COLORS[i % PERSON_COLORS.length]} /> {m.name}
                  </span>
                </td>
                <td>{formatBRL(paid)}</td>
                <td>{formatBRL(share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {split ? (
        <>
          <CategoryBars title="Recorrentes" group={groups.recurring} cats={cats} tripDays={tripDays} />
          <CategoryBars title="Não recorrentes" group={groups.nonRecurring} cats={cats} tripDays={tripDays} />
        </>
      ) : (
        <CategoryBars title="Por categoria" group={groups.recurring} cats={cats} tripDays={tripDays} />
      )}
    </div>
  );
}

/** Barras por categoria; o percentual é sobre o total do próprio grupo. */
function CategoryBars(props: { title: string; group: CategoryGroup; cats: Map<string, Category>; tripDays: number | null }) {
  const { group, cats, tripDays } = props;
  if (group.rows.length === 0) return null;
  const max = group.rows[0].cents || 1;
  return (
    <section className="card">
      <h2 className="card-title row between">
        <span>{props.title}</span>
        <span className="muted">{formatBRL(group.total)}</span>
      </h2>
      <ul className="bars">
        {group.rows.map(({ categoryId: cid, cents }) => {
          const c = cats.get(cid);
          return (
            <li key={cid || "none"}>
              <div className="row between small">
                <span>
                  {c?.emoji ?? "📦"} {c?.name ?? "Sem categoria"}
                </span>
                <span>
                  {formatBRL(cents)} <span className="muted">· {Math.round((cents / group.total) * 100)}%</span>
                </span>
              </div>
              {tripDays && <div className="muted small per-day-cat">{formatBRL(perDayCents(cents, tripDays))} por dia</div>}
              <div className="bar">
                <span style={{ width: `${(cents / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
