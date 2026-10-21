/**
 * "Hoje" no fuso do aparelho, em YYYY-MM-DD — numa viagem ao Peru é o dia de
 * Lima, não o de Brasília. Nunca use toISOString() (é UTC). `timeZone` existe
 * só para teste.
 */
export function todayISO(now: Date = new Date(), timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-10" → { start: "2026-10-01", end: "2026-10-31" } */
export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10" → "Outubro de 2026" */
export function monthLabel(ym: string): string {
  const s = monthFmt.format(new Date(`${ym}-01T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

/** Rótulo de cabeçalho de dia na lista: "Hoje", "Ontem" ou "sex., 03 de out." */
export function dayLabel(iso: string, today: string = todayISO()): string {
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, -1)) return "Ontem";
  return dayFmt.format(new Date(`${iso}T12:00:00Z`));
}

/**
 * Meses navegáveis de um projeto mensal: os que têm lançamento, mais o mês
 * corrente (para lançar no começo do mês sem cair num mês antigo). Ordem crescente.
 */
export function navigableMonths(withActivity: string[], current: string): string[] {
  return [...new Set([...withActivity, current])].sort();
}

/** Mês vizinho na lista (pula os vazios); null se não houver para esse lado. */
export function stepMonth(months: string[], ym: string, delta: -1 | 1): string | null {
  if (delta < 0) return months.filter((m) => m < ym).at(-1) ?? null;
  return months.find((m) => m > ym) ?? null;
}

const shortDayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", timeZone: "UTC" });

/** Data na própria linha (a lista já está num mês): "Hoje", "Ontem" ou "sex., 03". */
export function shortDayLabel(iso: string, today: string = todayISO()): string {
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, -1)) return "Ontem";
  return shortDayFmt.format(new Date(`${iso}T12:00:00Z`));
}
