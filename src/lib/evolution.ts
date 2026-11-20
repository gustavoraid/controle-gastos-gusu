import { shiftMonth } from "@/lib/dates";

/** Evolução dos gastos (projeto Casa): sempre 12 meses no gráfico. */
export const EVOLUTION_MONTHS = 12;

type Row = { spentOn: string; categoryId: string | null; amountCents: number };

/** Período da aba Evolução: "12m" (últimos 12 meses, padrão) ou um ano ("2025"). */
export type EvolutionPeriod = string;
export const LAST_12 = "12m";

/** Meses do período, do mais antigo ao mais recente: 12 terminando no mês atual, ou jan–dez do ano. */
export function periodMonths(period: EvolutionPeriod, current: string, n = EVOLUTION_MONTHS): string[] {
  if (period === LAST_12) return Array.from({ length: n }, (_, i) => shiftMonth(current, i - (n - 1)));
  return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);
}

/** Anos com lançamento (e o atual), do mais recente ao mais antigo, para o seletor. */
export function availableYears(monthsWithActivity: string[], current: string): string[] {
  const ys = new Set(monthsWithActivity.map((m) => m.slice(0, 4)));
  ys.add(current.slice(0, 4));
  return [...ys].sort().reverse();
}

/** Mês destacado ao abrir um período: o atual se estiver nele, senão o último do período. */
export function defaultMonth(months: string[], current: string): string {
  return months.includes(current) ? current : months[months.length - 1];
}

export interface MonthTotals {
  month: string;
  recurring: number;
  nonRecurring: number;
}

/** Total de cada mês da janela (meses sem gasto = 0), separado pela marcação da categoria. */
export function monthlyTotals(rows: Row[], months: string[], isNonRecurring: (categoryId: string) => boolean): MonthTotals[] {
  const by = new Map(months.map((m) => [m, { month: m, recurring: 0, nonRecurring: 0 }]));
  for (const r of rows) {
    const t = by.get(r.spentOn.slice(0, 7));
    if (!t) continue;
    if (r.categoryId && isNonRecurring(r.categoryId)) t.nonRecurring += r.amountCents;
    else t.recurring += r.amountCents;
  }
  return months.map((m) => by.get(m)!);
}

/** Total da categoria ("" = sem categoria) em cada mês da janela. */
export function categoryMonthly(rows: Row[], months: string[], categoryId: string): number[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const r of rows) {
    if ((r.categoryId ?? "") !== categoryId) continue;
    const i = idx.get(r.spentOn.slice(0, 7));
    if (i !== undefined) out[i] += r.amountCents;
  }
  return out;
}

/**
 * Índices dos meses que entram na média: só os já fechados (antes do mês atual).
 * O mês em andamento puxaria a média para baixo; lançamento futuro, idem.
 */
export function closedMonthIndexes(months: string[], current: string, firstMonth?: string): number[] {
  // Antes do primeiro lançamento do projeto não é "mês sem gasto": fica fora da média.
  return months.flatMap((m, i) => (m < current && (!firstMonth || m >= firstMonth) ? [i] : []));
}

/** Média em centavos inteiros dos valores nas posições dadas (0 se não houver nenhuma). */
export function averageAt(values: number[], indexes: number[]): number {
  if (indexes.length === 0) return 0;
  return Math.round(indexes.reduce((acc, i) => acc + values[i], 0) / indexes.length);
}

/** Diferença para a média; pct arredondado, null quando a média é zero. */
export function vsAverage(value: number, average: number): { diff: number; pct: number | null } {
  return { diff: value - average, pct: average > 0 ? Math.round(((value - average) / average) * 100) : null };
}
