import { shiftMonth } from "@/lib/dates";

/** Evolução dos gastos (projeto Casa): sempre 12 meses no gráfico. */
export const EVOLUTION_MONTHS = 12;

type Row = { spentOn: string; categoryId: string | null; amountCents: number };

/**
 * Meses do gráfico, do mais antigo ao mais recente. Termina no mês atual para o
 * mês escolhido ficar dentro da janela sem ela "andar" a cada toque; só se
 * desloca quando o mês escolhido cai fora dela (futuro ou mais de 11 meses atrás).
 */
export function evolutionWindow(selected: string, current: string, n = EVOLUTION_MONTHS): string[] {
  const outside = selected > current || selected < shiftMonth(current, -(n - 1));
  const end = outside ? selected : current;
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - (n - 1)));
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
export function closedMonthIndexes(months: string[], current: string): number[] {
  return months.flatMap((m, i) => (m < current ? [i] : []));
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
