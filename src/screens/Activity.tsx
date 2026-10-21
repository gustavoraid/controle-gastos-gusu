import { useEffect, useState } from "react";
import { Avatar, ErrorBox, Header, Loading, PERSON_COLORS } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { back, go } from "@/hooks/useRoute";
import { listRecentActivity } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { dayLabel } from "@/lib/dates";
import { buildFeed, feedDay, feedTitle, isUnseen, type FeedItem } from "@/lib/feed";
import { formatBRL } from "@/lib/money";
import { getFeedSeen, setFeedSeen } from "@/lib/storage";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Últimas atividades de todos os projetos: o que seriam as notificações, incluindo as minhas. */
export function Activity({ me }: { me: string }) {
  const { data, error, reload } = useLoad(() => listRecentActivity(50), []);
  // Última visita fica congelada enquanto a tela está aberta (para os "novos" não sumirem na hora).
  const [lastSeen] = useState(getFeedSeen);
  useEffect(() => {
    if (data) setFeedSeen(Date.now());
  }, [data]);

  return (
    <>
      <Header title="Atividades" onBack={() => back("/")} />
      <main className="page">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && <Feed me={me} data={data} lastSeen={lastSeen} />}
      </main>
    </>
  );
}

function Feed(props: { me: string; data: Awaited<ReturnType<typeof listRecentActivity>>; lastSeen: number | null }) {
  const { me, data } = props;
  const items = buildFeed(data.expenses, data.settlements, data.rates, 50);
  const nameOf = new Map(data.people.map((p) => [p.id, p.name]));
  const colorOf = new Map(data.people.map((p, i) => [p.id, PERSON_COLORS[i % PERSON_COLORS.length]]));
  const name = (uid: string) => nameOf.get(uid) ?? "?";

  if (items.length === 0) {
    return (
      <div className="empty">
        <p className="empty-emoji">🔔</p>
        <p>Nenhuma atividade ainda.</p>
      </div>
    );
  }

  const groups: { day: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const day = feedDay(it);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }

  return (
    <div className="activity">
      <p className="muted small">Últimos 50 lançamentos de todos os projetos, na ordem em que foram feitos.</p>
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="day-label">{dayLabel(g.day)}</h2>
          <ul className="list">
            {g.items.map((it) => {
              const project = data.projects.get(it.projectId);
              const unseen = isUnseen(it, me, props.lastSeen);
              const open = () => go(it.kind === "expense" ? `/p/${it.projectId}/add?e=${it.id}` : `/p/${it.projectId}`);
              return (
                <li key={it.kind + it.id}>
                  <button className={`list-item compact feed-item ${unseen ? "unseen" : ""}`} onClick={open}>
                    <Avatar name={name(it.actor)} size={30} color={colorOf.get(it.actor)} />
                    <span className="grow min0">
                      <strong className="feed-title">{feedTitle(it, me, name)}</strong>
                      <span className="muted small ellipsis">
                        {project ? `${project.emoji} ${project.name}` : "Projeto"} · {timeFmt.format(new Date(it.createdAt))}
                        {it.kind === "expense" && it.paidBy !== it.actor && ` · pago por ${it.paidBy === me ? "você" : name(it.paidBy)}`}
                      </span>
                    </span>
                    <span className="amount-col">
                      {it.kind === "expense" ? (
                        <>
                          <span className="money">{formatMoney(it.amount, it.currency)}</span>
                          {it.currency !== "BRL" && <span className="muted small">≈ {formatBRL(it.brlCents)}</span>}
                        </>
                      ) : (
                        <span className="money">{formatBRL(it.amountCents)}</span>
                      )}
                    </span>
                    {unseen && <span className="unseen-dot" aria-label="Novo" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
