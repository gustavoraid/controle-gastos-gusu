import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBox, Loading } from "@/components/ui";
import { useLoad } from "@/hooks/useLoad";
import { go } from "@/hooks/useRoute";
import { listActivity } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { monthLabel, monthRange, shortDayLabel } from "@/lib/dates";
import {
  averageAt,
  categoryMonthly,
  closedMonthIndexes,
  defaultMonth,
  LAST_12,
  monthlyTotals,
  periodMonths,
  vsAverage,
} from "@/lib/evolution";
import { formatBRL } from "@/lib/money";
import type { Category, Expense } from "@/lib/types";

const shortMonthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
/** "2026-03" → "mar" */
const shortMonth = (ym: string) => shortMonthFmt.format(new Date(`${ym}-01T12:00:00Z`)).replace(".", "");

/**
 * Aba "Evolução" do projeto Casa: 12 meses de gasto total (sem divisão nem quem
 * pagou), recorrente × não recorrente, comparado com a média dos meses fechados.
 * Níveis: visão geral → categoria → lançamentos.
 */
export function Evolution(props: {
  projectId: string;
  current: string;
  /** Anos com lançamento (mais recente primeiro), para o seletor de período. */
  years: string[];
  /** Primeiro mês com lançamento no projeto ("YYYY-MM"): antes dele não entra na média. */
  firstMonth?: string;
  cats: Map<string, Category>;
  /** Muda quando os lançamentos mudam (tempo real / edição) para buscar de novo. */
  version: number;
}) {
  const { projectId, current, cats } = props;
  const [catId, setCatId] = useState<string | null>(null);
  // Período e mês destacado são só desta aba (não mexem no mês da lista de lançamentos).
  const [period, setPeriod] = useState(LAST_12);
  const months = periodMonths(period, current);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : defaultMonth(months, current);
  const selectMonth = (i: number) => setPicked(months[i]);
  // Ao trocar de categoria, o chip escolhido fica visível na faixa (rolagem lateral).
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(".chip.active");
    const box = chipsRef.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }, [catId]);
  const first = months[0];
  const last = months[months.length - 1];
  const load = useLoad(
    () => listActivity(projectId, { start: monthRange(first).start, end: monthRange(last).end }),
    [projectId, first, last, props.version],
  );
  const isNonRec = (id: string) => !!cats.get(id)?.nonRecurring;
  const expenses = load.data?.expenses ?? null;

  const view = useMemo(() => {
    if (!expenses) return null;
    const totals = monthlyTotals(expenses, months, isNonRec);
    const closed = closedMonthIndexes(months, current, props.firstMonth);
    return { totals, closed };
  }, [expenses, first, cats, current, props.firstMonth]);

  const periodLabel = period === LAST_12 ? "Últimos 12 meses" : period;
  const picker = (
    <select
      className="evo-period"
      value={period}
      aria-label="Período"
      onChange={(e) => {
        setPeriod(e.target.value);
        setPicked(null);
      }}
    >
      <option value={LAST_12}>Últimos 12 meses</option>
      {props.years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );

  if (load.error) return <ErrorBox message={load.error} onRetry={load.reload} />;
  if (!expenses || !view) return <Loading />;

  const sel = months.indexOf(month);
  const inProgress = month === current;

  if (catId !== null) {
    const c = cats.get(catId);
    const values = categoryMonthly(expenses, months, catId);
    const avg = averageAt(values, view.closed);
    const list = expenses.filter((e) => (e.categoryId ?? "") === catId && e.spentOn.startsWith(month));
    // Troca de categoria sem voltar: chips com as categorias do período, da maior para a menor.
    const inPeriod = new Set(months);
    const sums = new Map<string, number>();
    for (const e of expenses) {
      if (!inPeriod.has(e.spentOn.slice(0, 7))) continue;
      const k = e.categoryId ?? "";
      sums.set(k, (sums.get(k) ?? 0) + e.amountCents);
    }
    if (!sums.has(catId)) sums.set(catId, 0);
    const chips = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return (
      <div className="stack">
        {picker}
        <div className="evo-chips" role="tablist" aria-label="Categoria" ref={chipsRef}>
          <button type="button" className="chip back" onClick={() => setCatId(null)}>
            ‹ Todas
          </button>
          {chips.map((id) => {
            const k = cats.get(id);
            return (
              <button
                key={id || "none"}
                type="button"
                role="tab"
                aria-selected={id === catId}
                className={`chip${id === catId ? " active" : ""}`}
                onClick={() => setCatId(id)}
              >
                {k?.emoji ?? "📦"} {k?.name ?? "Sem categoria"}
              </button>
            );
          })}
        </div>
        <section className="card">
          <h2 className="card-title">
            {c?.emoji ?? "📦"} {c?.name ?? "Sem categoria"}
          </h2>
          <BarChart
            months={months}
            selected={sel}
            stacks={values.map((v) => [v, 0])}
            average={avg}
            onSelect={selectMonth}
          />
          <Compare label={monthLabel(month)} value={values[sel]} average={avg} inProgress={inProgress} big />
        </section>
        <section className="card">
          <h2 className="card-title row between">
            <span>Lançamentos</span>
            <span className="muted">{list.length}</span>
          </h2>
          {list.length === 0 ? (
            <p className="muted small">Nada nesta categoria em {monthLabel(month).toLowerCase()}.</p>
          ) : (
            <ul className="list evo-list">
              {list.map((e) => (
                <EvoExpenseRow key={e.id} e={e} projectId={projectId} />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const totalOf = (t: { recurring: number; nonRecurring: number }) => t.recurring + t.nonRecurring;
  const recVals = view.totals.map((t) => t.recurring);
  const nonVals = view.totals.map((t) => t.nonRecurring);
  const totVals = view.totals.map(totalOf);
  const avgTotal = averageAt(totVals, view.closed);
  const t = view.totals[sel];

  // Categorias com gasto no mês ou na média (mostra também a que zerou no mês).
  const ids = new Set<string>();
  for (const e of expenses) ids.add(e.categoryId ?? "");
  const rows = [...ids]
    .map((id) => {
      const values = categoryMonthly(expenses, months, id);
      return { id, values, value: values[sel], avg: averageAt(values, view.closed) };
    })
    .filter((r) => r.value > 0 || r.avg > 0)
    .sort((a, b) => b.value - a.value || b.avg - a.avg);
  const rec = rows.filter((r) => !(r.id && isNonRec(r.id)));
  const non = rows.filter((r) => r.id && isNonRec(r.id));

  return (
    <div className="stack">
      {picker}
      <section className="card">
        <h2 className="card-title">{periodLabel}</h2>
        <div className="evo-legend small">
          <span>
            <i className="sw rec" /> Recorrentes
          </span>
          <span>
            <i className="sw non" /> Não recorrentes
          </span>
          <span>
            <i className="sw avg" /> Média
          </span>
        </div>
        <BarChart
          months={months}
          selected={sel}
          stacks={view.totals.map((x) => [x.recurring, x.nonRecurring])}
          average={avgTotal}
          onSelect={selectMonth}
        />
        <p className="muted small evo-note">
          {view.closed.length > 0 ? `Média dos ${view.closed.length} meses fechados. ` : ""}Toque numa barra para ver o mês.
        </p>
      </section>

      <section className="card evo-month">
        <h2 className="card-title">
          {monthLabel(month)}
          {inProgress && <span className="muted small"> · em andamento</span>}
        </h2>
        {inProgress && <p className="muted small evo-note">Mês ainda aberto: a comparação com a média só vale quando ele fechar.</p>}
        <Compare label="Total" value={totalOf(t)} average={avgTotal} inProgress={inProgress} big />
        <div className="evo-two">
          <Compare label="Recorrentes" value={t.recurring} average={averageAt(recVals, view.closed)} inProgress={inProgress} />
          <Compare label="Não recorrentes" value={t.nonRecurring} average={averageAt(nonVals, view.closed)} inProgress={inProgress} />
        </div>
      </section>

      <CategoryTable title="Recorrentes" rows={rec} cats={cats} sel={sel} neutral={inProgress} onOpen={setCatId} />
      <CategoryTable title="Não recorrentes" rows={non} cats={cats} sel={sel} neutral={inProgress} onOpen={setCatId} />
    </div>
  );
}

function Compare(props: { label: string; value: number; average: number; big?: boolean; inProgress?: boolean }) {
  const { diff, pct } = vsAverage(props.value, props.average);
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "";
  return (
    <div className={`evo-compare${props.big ? " big" : ""}`}>
      <span className="muted small">{props.label}</span>
      <span className="money">{formatBRL(props.value)}</span>
      <span className="small">
        {props.average > 0 && props.inProgress ? (
          <span className="muted">média {formatBRL(props.average)}</span>
        ) : props.average > 0 ? (
          <>
            <span className={`evo-delta ${cls}`}>
              {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {pct !== null ? `${Math.abs(pct)}%` : ""}
            </span>{" "}
            <span className="muted">média {formatBRL(props.average)}</span>
          </>
        ) : (
          <span className="muted">sem média ainda</span>
        )}
      </span>
    </div>
  );
}

function CategoryTable(props: {
  title: string;
  rows: { id: string; values: number[]; value: number; avg: number }[];
  cats: Map<string, Category>;
  sel: number;
  /** Mês em andamento: sem seta de comparação (ainda incompleto). */
  neutral: boolean;
  onOpen: (id: string) => void;
}) {
  if (props.rows.length === 0) return null;
  const total = props.rows.reduce((acc, r) => acc + r.value, 0);
  return (
    <section className="card">
      <h2 className="card-title row between">
        <span>{props.title}</span>
        <span className="muted">{formatBRL(total)}</span>
      </h2>
      <ul className="list evo-cats">
        {props.rows.map((r) => {
          const c = props.cats.get(r.id);
          const { diff, pct } = vsAverage(r.value, r.avg);
          return (
            <li key={r.id || "none"}>
              <button type="button" className="list-item compact" onClick={() => props.onOpen(r.id)}>
                <span className="cat-badge sm">{c?.emoji ?? "📦"}</span>
                <span className="grow min0">
                  <strong className="ellipsis">{c?.name ?? "Sem categoria"}</strong>
                  <span className="muted small">
                    média {formatBRL(r.avg)}
                    {!props.neutral && pct !== null && diff !== 0 && (
                      <span className={`evo-delta ${diff > 0 ? "up" : "down"}`}>
                        {" "}
                        {diff > 0 ? "▲" : "▼"} {Math.abs(pct)}%
                      </span>
                    )}
                  </span>
                </span>
                <Spark values={r.values} selected={props.sel} />
                <span className="money evo-cat-value">{formatBRL(r.value)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EvoExpenseRow({ e, projectId }: { e: Expense; projectId: string }) {
  return (
    <li>
      <button type="button" className="list-item compact" onClick={() => go(`/p/${projectId}/add?e=${e.id}`)}>
        <span className="grow min0">
          <strong className="ellipsis">{e.description}</strong>
          <span className="muted small">{shortDayLabel(e.spentOn)}</span>
        </span>
        <span className="amount-col">
          <span className="money">{formatMoney(e.amount, e.currency)}</span>
          {e.currency !== "BRL" && <span className="muted small">≈ {formatBRL(e.amountCents)}</span>}
        </span>
      </button>
    </li>
  );
}

/** Barras empilhadas (recorrente embaixo, não recorrente em cima) + linha da média. */
function BarChart(props: {
  months: string[];
  selected: number;
  stacks: [number, number][];
  average: number;
  onSelect: (i: number) => void;
}) {
  const W = 340;
  const H = 150;
  const top = 18;
  const bottom = 20;
  const n = props.months.length;
  const slot = W / n;
  const bw = slot * 0.62;
  const max = Math.max(1, props.average, ...props.stacks.map(([a, b]) => a + b));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const base = H - bottom;
  const s = props.stacks[props.selected];
  const selTotal = s ? s[0] + s[1] : 0;
  return (
    <svg className="evo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gasto por mês">
      {props.stacks.map(([a, b], i) => {
        const x = i * slot + (slot - bw) / 2;
        const on = i === props.selected;
        return (
          <g key={props.months[i]} className={on ? "on" : ""} onClick={() => props.onSelect(i)}>
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
            {a > 0 && <rect className="rec" x={x} y={y(a)} width={bw} height={base - y(a)} rx={2} />}
            {b > 0 && <rect className="non" x={x} y={y(a + b)} width={bw} height={y(a) - y(a + b)} rx={2} />}
            <text className="lbl" x={i * slot + slot / 2} y={H - 6} textAnchor="middle">
              {shortMonth(props.months[i])}
            </text>
          </g>
        );
      })}
      {props.average > 0 && <line className="avg" x1={0} x2={W} y1={y(props.average)} y2={y(props.average)} />}
      {s && selTotal > 0 && (
        <text
          className="val"
          x={Math.min(Math.max(props.selected * slot + slot / 2, 30), W - 30)}
          y={y(selTotal) - 5}
          textAnchor="middle"
        >
          {compactBRL(selTotal)}
        </text>
      )}
    </svg>
  );
}

function Spark({ values, selected }: { values: number[]; selected: number }) {
  const W = 56;
  const H = 22;
  const max = Math.max(1, ...values);
  const bw = W / values.length;
  return (
    <svg className="evo-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(1.5, (v / max) * H) : 0;
        return <rect key={i} className={i === selected ? "on" : ""} x={i * bw + 0.5} y={H - h} width={bw - 1} height={h} />;
      })}
    </svg>
  );
}

/** "R$ 15,6 mil" / "R$ 820" — rótulo curto em cima da barra. */
function compactBRL(cents: number): string {
  const reais = cents / 100;
  if (reais >= 1000) return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(reais).toLocaleString("pt-BR")}`;
}
