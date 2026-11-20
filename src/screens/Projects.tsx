import { useEffect, useState } from "react";
import { ErrorBox, Header, Loading } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { go } from "@/hooks/useRoute";
import { countUnseenActivity, listProjects, listSpending, signOut } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { monthlyAverage } from "@/lib/evolution";
import { formatBRL } from "@/lib/money";
import { perDayCents } from "@/lib/trip";
import { badgeLabel } from "@/lib/feed";
import { getFeedSeen } from "@/lib/storage";
import type { ProjectSummary } from "@/lib/types";

export function Projects({ me }: { me: string }) {
  const { data, error, reload } = useLoad(() => listProjects(me), [me]);
  // Médias vêm à parte: a lista aparece já, e o número entra quando chegar.
  const spending = useLoad(() => listSpending(), [me]);
  const [showArchived, setShowArchived] = useState(false);
  const unseen = useLoad(() => countUnseenActivity(me, getFeedSeen()), [me]);
  // Voltou para o app (estava em segundo plano): atualiza o contador do sino.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && unseen.reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [unseen.reload]);
  const badge = badgeLabel(unseen.data ?? 0);

  const menu = (
    <button
      className="icon-btn"
      aria-label="Sair da conta"
      onClick={() => {
        if (confirm("Sair da conta neste aparelho?")) signOut();
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  const active = data?.filter((p) => !p.archived) ?? [];
  const archived = data?.filter((p) => p.archived) ?? [];

  return (
    <>
      <Header
        title="Ratata"
        left={
          <button
            className="icon-btn bell"
            aria-label={badge ? `Atividades recentes, ${badge} novas` : "Atividades recentes"}
            onClick={() => go("/atividades")}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {badge && <span className="bell-badge">{badge}</span>}
          </button>
        }
        action={menu}
      />
      <main className="page">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <>
            {data.length === 0 && (
              <div className="empty">
                <p className="empty-emoji">👋</p>
                <p>Crie um projeto (Casa, Viagem…). Ele já nasce com os dois.</p>
              </div>
            )}

            <ul className="list">
              {active.map((p) => (
                <ProjectRow key={p.id} p={p} me={me} spending={spending.data?.get(p.id) ?? (spending.data ? [] : null)} />
              ))}
            </ul>

            {archived.length > 0 && (
              <>
                <button className="btn link" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? "Esconder arquivados" : `Ver arquivados (${archived.length})`}
                </button>
                {showArchived && (
                  <ul className="list dim">
                    {archived.map((p) => (
                      <ProjectRow key={p.id} p={p} me={me} spending={spending.data?.get(p.id) ?? (spending.data ? [] : null)} />
                    ))}
                  </ul>
                )}
              </>
            )}

            <button className="btn primary big" onClick={() => go("/novo")}>
              + Novo projeto
            </button>
          </>
        )}
      </main>
    </>
  );
}

function ProjectRow(props: { p: ProjectSummary; me: string; spending: { spentOn: string; amountCents: number }[] | null }) {
  const { p, me } = props;
  const myName = p.members.find((m) => m.userId === me)?.name ?? "?";
  const other = p.members.find((m) => m.userId !== me)?.name ?? "?";
  // Só existem duas pessoas: "Gu deve R$ X" já diz a quem.
  const cents = p.myNetCents;
  return (
    <li>
      <button className="list-item" onClick={() => go(`/p/${p.id}`)}>
        <span className="cat-badge big">{p.emoji}</span>
        <span className="grow min0">
          <strong className="ellipsis">{p.name}</strong>
          {/* saldo em segundo plano: só uma linha discreta */}
          <span className="muted small">
            {cents === 0 ? "quitado" : `${cents < 0 ? myName : other} deve ${formatBRL(Math.abs(cents))}`}
          </span>
        </span>
        <SpendStat p={p} rows={props.spending} />
      </button>
    </li>
  );
}

/** Número principal do projeto: média mensal (Casa/Outros) ou gasto por dia (Viagem). */
function SpendStat({ p, rows }: { p: ProjectSummary; rows: { spentOn: string; amountCents: number }[] | null }) {
  if (!rows) return <span className="spend-stat muted small">…</span>;
  if (p.type === "viagem") {
    const total = rows.reduce((acc, r) => acc + r.amountCents, 0);
    if (p.tripDays) {
      return (
        <span className="spend-stat">
          <span className="money">{formatBRL(perDayCents(total, p.tripDays))}</span>
          {/* o total fica dentro do projeto: aqui ele espremia o nome da viagem */}
          <span className="muted small">por dia</span>
        </span>
      );
    }
    return (
      <span className="spend-stat">
        <span className="money">{formatBRL(total)}</span>
        <span className="muted small">total</span>
      </span>
    );
  }
  const first = rows.reduce<string | undefined>((m, r) => (!m || r.spentOn < m ? r.spentOn : m), undefined)?.slice(0, 7);
  const current = todayISO().slice(0, 7);
  const avg = monthlyAverage(rows, current, first);
  if (!first || first >= current) return <span className="spend-stat muted small">sem média ainda</span>;
  return (
    <span className="spend-stat">
      <span className="money">{formatBRL(avg)}</span>
      <span className="muted small">média/mês</span>
    </span>
  );
}
