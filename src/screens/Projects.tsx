import { useState } from "react";
import { Avatar, ErrorBox, Header, Loading, Money } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { go } from "@/hooks/useRoute";
import { listProjects, signOut } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

export function Projects({ me }: { me: string }) {
  const { data, error, reload } = useLoad(() => listProjects(me), [me]);
  const [showArchived, setShowArchived] = useState(false);

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
  const total = active.reduce((acc, p) => acc + p.myNetCents, 0);

  return (
    <>
      <Header title="Gastos do Casal" action={menu} />
      <main className="page">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <>
            {active.length > 0 && (
              <section className="total-card">
                <span className="muted">Somando todos os projetos</span>
                <BalanceLine cents={total} big />
              </section>
            )}

            {data.length === 0 && (
              <div className="empty">
                <p className="empty-emoji">👋</p>
                <p>Crie um projeto (Casa, Viagem…). Ele já nasce com vocês dois.</p>
              </div>
            )}

            <ul className="list">
              {active.map((p) => (
                <ProjectRow key={p.id} p={p} me={me} />
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
                      <ProjectRow key={p.id} p={p} me={me} />
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

function ProjectRow({ p, me }: { p: ProjectSummary; me: string }) {
  const others = p.members.filter((m) => m.userId !== me);
  return (
    <li>
      <button className="list-item" onClick={() => go(`/p/${p.id}`)}>
        <span className="cat-badge big">{p.emoji}</span>
        <span className="grow">
          <strong>{p.name}</strong>
          <span className="muted small row gap-sm">
            {others.map((m) => <Avatar key={m.userId} name={m.name} size={18} />)}
            {others.length > 0 && others.map((m) => m.name).join(", ")}
          </span>
        </span>
        <BalanceLine cents={p.myNetCents} />
      </button>
    </li>
  );
}

export function BalanceLine({ cents, big }: { cents: number; big?: boolean }) {
  if (cents === 0) return <span className={`balance muted ${big ? "big" : ""}`}>quitado</span>;
  return (
    <span className={`balance ${big ? "big" : ""}`}>
      <span className="small muted">{cents > 0 ? "a receber" : "você deve"}</span>
      <Money cents={Math.abs(cents)} tone={cents > 0 ? "pos" : "neg"} />
    </span>
  );
}
