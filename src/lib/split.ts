export interface Share {
  userId: string;
  weight: number;
}

export interface SplitLine {
  userId: string;
  amountCents: number;
}

/**
 * Divide um valor em centavos pelos pesos, sem perder nem inventar centavo
 * (método do maior resto). Empate no resto vai para quem vem primeiro na lista.
 * Pesos todos zero = divisão igual.
 */
export function splitByWeights(totalCents: number, shares: Share[]): SplitLine[] {
  if (shares.length === 0) return [];
  const sum = shares.reduce((acc, s) => acc + Math.max(0, s.weight), 0);
  const weights = sum > 0 ? shares.map((s) => Math.max(0, s.weight)) : shares.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);

  const raw = weights.map((w) => (totalCents * w) / total);
  const lines = shares.map((s, i) => ({ userId: s.userId, amountCents: Math.floor(raw[i]) }));
  let leftover = totalCents - lines.reduce((acc, l) => acc + l.amountCents, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0; k = (k + 1) % order.length, leftover--) {
    lines[order[k].i].amountCents += 1;
  }
  return lines;
}

const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Pesos → rótulos de porcentagem para exibir ("33,3%", "66,7%"). Pesos são
 * livres (1 e 2, 60 e 40, 3 e 2…): o cálculo usa a razão exata, nunca o
 * percentual arredondado — este é só para mostrar.
 */
export function percentLabels(shares: Share[]): string[] {
  const sum = shares.reduce((acc, s) => acc + Math.max(0, s.weight), 0);
  return shares.map((s) => `${pctFmt.format(sum > 0 ? (Math.max(0, s.weight) / sum) * 100 : 100 / shares.length)}%`);
}

/** "2", "1,5", "0.5" → número; inválido ou negativo → null. */
export function parseWeight(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  return Number(s);
}

/**
 * Parte de cada pessoa numa despesa: sempre a proporção ATUAL do projeto.
 * Ordena por userId para o centavo de desempate cair no mesmo lugar que na
 * view expense_shares do banco (que desempata pelo menor user_id).
 */
export function expenseShares(totalCents: number, members: Share[]): SplitLine[] {
  const sorted = [...members].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  return splitByWeights(totalCents, sorted);
}

export function splitTotal(lines: SplitLine[]): number {
  return lines.reduce((acc, l) => acc + l.amountCents, 0);
}
