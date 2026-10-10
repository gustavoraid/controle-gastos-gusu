import { useEffect, useMemo, useState } from "react";
import { Avatar, ErrorBox, Header, Loading, Money, toast } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { useProject } from "@/hooks/useProject";
import { back, go } from "@/hooks/useRoute";
import { deleteSettlement, listMonth } from "@/lib/api";
import { expenseImpact, suggestTransfers } from "@/lib/balances";
import { dayLabel, monthLabel, monthRange, shiftMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { expenseShares, weightsToPercents } from "@/lib/split";
import { setLastProject } from "@/lib/storage";
import type { Category, Expense, Member, Settlement } from "@/lib/types";

type Item = { kind: "e"; date: string; at: string; e: Expense } | { kind: "s"; date: string; at: string; s: Settlement };

export function ProjectScreen({ id, me }: { id: string; me: string }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [tab, setTab] = useState<"lista" | "resumo">("lista");
  const range = monthRange(month);
  const activity = useLoad(() => listMonth(id, range.start, range.end), [id, month]);
  const proj = useProject(id, activity.reload);

  useEffect(() => setLastProject(id), [id]);

  const data = proj.data;
  const names = useMemo(() => new Map(data?.members.map((m) => [m.userId, m.name]) ?? []), [data]);
  const cats = useMemo(() => new Map(data?.categories.map((c) => [c.id, c]) ?? []), [data]);

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
        {members.length < 2 && (
          <section className="invite-card">
            <p>
              <strong>Falta a segunda conta.</strong> Quando a outra pessoa criar a conta dela no app, ela entra
              automaticamente em todos os projetos.
            </p>
          </section>
        )}

        <BalanceBanner me={me} members={members} balances={balances} onSettle={() => go(`/p/${id}/acertar`)} />

        <nav className="month-nav">
          <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
        </nav>

        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "lista"} className={tab === "lista" ? "active" : ""} onClick={() => setTab("lista")}>
            Lançamentos
          </button>
          <button role="tab" aria-selected={tab === "resumo"} className={tab === "resumo" ? "active" : ""} onClick={() => setTab("resumo")}>
            Resumo do mês
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
            cats={cats}
            expenses={activity.data.expenses}
            settlements={activity.data.settlements}
            onChanged={() => {
              activity.reload();
              proj.reload();
            }}
          />
        )}
        {activity.data && tab === "resumo" && (
          <MonthSummary members={members} cats={cats} expenses={activity.data.expenses} />
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
  const pct = weightsToPercents(members);

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
          Divisão padrão: {members.map((m, i) => `${m.name} ${pct[i]}%`).join(" · ")}
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
  cats: Map<string, Category>;
  expenses: Expense[];
  settlements: Settlement[];
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
        <p>Nada lançado neste mês.</p>
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
                <ExpenseRow key={it.e.id} e={it.e} me={me} members={props.members} names={names} cat={it.e.categoryId ? cats.get(it.e.categoryId) : undefined} projectId={props.projectId} />
              ) : (
                <li key={it.s.id}>
                  <button className="list-item" onClick={() => removeSettlement(it.s)}>
                    <span className="cat-badge settle">💸</span>
                    <span className="grow">
                      <strong>
                        {names.get(it.s.fromUser)} pagou {names.get(it.s.toUser)}
                      </strong>
                      <span className="muted small">Acerto de contas</span>
                    </span>
                    <Money cents={it.s.amountCents} />
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

function ExpenseRow(props: { e: Expense; me: string; members: Member[]; names: Map<string, string>; cat?: Category; projectId: string }) {
  const { e, me, names, cat } = props;
  const shares = expenseShares(e.amountCents, props.members);
  const impact = expenseImpact(e, shares, me);
  const involved = e.paidBy === me || shares.some((s) => s.userId === me && s.amountCents > 0);
  const payer = e.paidBy === me ? "Você" : names.get(e.paidBy) ?? "?";

  return (
    <li>
      <button className="list-item" onClick={() => go(`/p/${props.projectId}/add?e=${e.id}`)}>
        <span className="cat-badge">{cat?.emoji ?? "📦"}</span>
        <span className="grow min0">
          <strong className="ellipsis">{e.description}</strong>
          <span className="muted small">
            {payer} pagou {formatBRL(e.amountCents)}
          </span>
        </span>
        <span className="impact">
          {!involved ? (
            <span className="muted small">não envolve você</span>
          ) : impact === 0 ? (
            <span className="muted small">sem dívida</span>
          ) : (
            <>
              <span className={`small ${impact > 0 ? "pos" : "neg"}`}>{impact > 0 ? "você emprestou" : "você deve"}</span>
              <Money cents={Math.abs(impact)} tone={impact > 0 ? "pos" : "neg"} />
            </>
          )}
        </span>
      </button>
    </li>
  );
}

function MonthSummary(props: { members: Member[]; cats: Map<string, Category>; expenses: Expense[] }) {
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
        <span className="muted">Total gasto no mês</span>
        <span className="money big">{formatBRL(total)}</span>
        <span className="muted small">{expenses.length} despesa{expenses.length > 1 ? "s" : ""}</span>
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
            {people.map(({ m, paid, share }) => (
              <tr key={m.userId}>
                <td>
                  <span className="row gap-sm">
                    <Avatar name={m.name} size={24} /> {m.name}
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
