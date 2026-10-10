import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, ErrorBox, Header, Loading, Money, PERSON_COLORS, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back, go } from "@/hooks/useRoute";
import { deleteSettlement, listActivity } from "@/lib/api";
import { suggestTransfers } from "@/lib/balances";
import { dayLabel, monthLabel, monthRange, shiftMonth, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { formatBRL } from "@/lib/money";
import { expenseShares, percentLabels } from "@/lib/split";
import { setLastProject } from "@/lib/storage";
import type { Category, Expense, Member, Settlement } from "@/lib/types";

type Item = { kind: "e"; date: string; at: string; e: Expense } | { kind: "s"; date: string; at: string; s: Settlement };

export function ProjectScreen({ id, me }: { id: string; me: string }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [tab, setTab] = useState<"lista" | "resumo">("lista");
  const reloadActivity = useRef<() => void>(undefined);
  const proj = useProject(id, () => reloadActivity.current?.());
  // Viagem mostra tudo de uma vez (sem navegação por mês); os outros tipos, mês a mês.
  const type = proj.data?.project.type;
  const isTrip = type === "viagem";
  const activity = useLoad(
    () => (type ? listActivity(id, isTrip ? undefined : monthRange(month)) : Promise.resolve(null)),
    [id, month, type],
  );
  reloadActivity.current = activity.reload;

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
  const settingsBtn = (
    <button className="icon-btn" aria-label="Ajustes do projeto" onClick={() => go(`/p/${id}/config`)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  );

  return (
    <>
      <Header title={`${project.emoji} ${project.name}`} onBack={() => back("/")} action={settingsBtn} />
      <main className="page with-fab">
        <BalanceBanner me={me} members={members} balances={balances} onSettle={() => go(`/p/${id}/acertar`)} />

        {!isTrip && (
        <nav className="month-nav">
          <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
        </nav>
        )}

        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "lista"} className={tab === "lista" ? "active" : ""} onClick={() => setTab("lista")}>
            Lançamentos
          </button>
          <button role="tab" aria-selected={tab === "resumo"} className={tab === "resumo" ? "active" : ""} onClick={() => setTab("resumo")}>
            {isTrip ? "Resumo" : "Resumo do mês"}
          </button>
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
            onChanged={() => {
              activity.reload();
              proj.reload();
            }}
          />
        )}
        {activity.data && tab === "resumo" && (
          <MonthSummary members={members} cats={cats} expenses={activity.data.expenses} isTrip={isTrip} />
        )}
      </main>

      <button className="fab" onClick={() => go(`/p/${id}/add`)} aria-label="Adicionar despesa">
        <span aria-hidden="true">+</span> Despesa
      </button>
    </>
  );
}

function BalanceBanner(props: { me: string; members: Member[]; balances: Record<string, number>; onSettle: () => void }) {
  const { me, members, balances } = props;
  const name = (uid: string) => members.find((m) => m.userId === uid)?.name ?? "?";
  const mine = suggestTransfers(balances).filter((t) => t.from === me || t.to === me);
  const pct = percentLabels(members);

  return (
    <section className="balance-banner">
      {mine.length === 0 ? (
        <p className="balance-title">Tudo certo entre vocês ✨</p>
      ) : (
        mine.map((t) => (
          <p key={t.from + t.to} className="balance-title">
            {t.to === me ? (
              <>
                {name(t.from)} te deve <Money cents={t.amountCents} tone="pos" />
              </>
            ) : (
              <>
                Você deve <Money cents={t.amountCents} tone="neg" /> a {name(t.to)}
              </>
            )}
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
  onChanged: () => void;
}) {
  const { me, names, cats } = props;
  const items: Item[] = [
    ...props.expenses.map((e): Item => ({ kind: "e", date: e.spentOn, at: e.createdAt, e })),
    ...props.settlements.map((s): Item => ({ kind: "s", date: s.settledOn, at: s.createdAt, s })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));

  if (items.length === 0) {
    return (
      <div className="empty">
        <p className="empty-emoji">🧾</p>
        <p>{props.emptyText}</p>
      </div>
    );
  }

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

  return (
    <div className="activity">
      {groups.map((g) => (
        <section key={g.date}>
          <h2 className="day-label">{dayLabel(g.date)}</h2>
          <ul className="list">
            {g.items.map((it) =>
              it.kind === "e" ? (
                <ExpenseRow key={it.e.id} e={it.e} me={me} names={names} color={props.colors.get(it.e.paidBy)} cat={it.e.categoryId ? cats.get(it.e.categoryId) : undefined} projectId={props.projectId} />
              ) : (
                <li key={it.s.id}>
                  <button className="list-item compact" onClick={() => removeSettlement(it.s)}>
                    <span className="cat-badge sm settle">💸</span>
                    <span className="grow min0">
                      <strong className="ellipsis">Acerto de contas</strong>
                      <span className="payer small">
                        <Avatar name={names.get(it.s.fromUser) ?? "?"} size={16} color={props.colors.get(it.s.fromUser)} />
                        {it.s.fromUser === me ? "Você" : names.get(it.s.fromUser)} → {it.s.toUser === me ? "você" : names.get(it.s.toUser)}
                      </span>
                    </span>
                    <span className="amount-col">
                      <Money cents={it.s.amountCents} />
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
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
}) {
  const { e, me, names, cat } = props;
  const payerName = names.get(e.paidBy) ?? "?";

  return (
    <li>
      <button className="list-item compact" onClick={() => go(`/p/${props.projectId}/add?e=${e.id}`)}>
        <span className="cat-badge sm">{cat?.emoji ?? "📦"}</span>
        <span className="grow min0">
          <strong className="ellipsis">{e.description}</strong>
          {/* bolinha com a inicial na cor da pessoa: dá para ver quem pagou de relance */}
          <span className="payer small">
            <Avatar name={payerName} size={16} color={props.color} />
            {e.paidBy === me ? "Você" : payerName}
          </span>
        </span>
        <span className="amount-col">
          <span className="money">{formatMoney(e.amount, e.currency)}</span>
          {e.currency !== "BRL" && <span className="muted small">≈ {formatBRL(e.amountCents)}</span>}
        </span>
      </button>
    </li>
  );
}

function MonthSummary(props: { members: Member[]; cats: Map<string, Category>; expenses: Expense[]; isTrip: boolean }) {
  const { members, cats, expenses } = props;
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

  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const k = e.categoryId ?? "";
    byCat.set(k, (byCat.get(k) ?? 0) + e.amountCents);
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = catRows[0]?.[1] ?? 1;

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

      <section className="card">
        <h2 className="card-title">Por categoria</h2>
        <ul className="bars">
          {catRows.map(([cid, cents]) => {
            const c = cats.get(cid);
            return (
              <li key={cid || "none"}>
                <div className="row between small">
                  <span>
                    {c?.emoji ?? "📦"} {c?.name ?? "Sem categoria"}
                  </span>
                  <span>
                    {formatBRL(cents)} <span className="muted">· {Math.round((cents / total) * 100)}%</span>
                  </span>
                </div>
                <div className="bar">
                  <span style={{ width: `${(cents / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
