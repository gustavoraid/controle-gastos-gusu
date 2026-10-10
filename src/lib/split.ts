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

/** Pesos → porcentagens inteiras que somam 100 (para exibir "60% / 40%"). */
export function weightsToPercents(shares: Share[]): number[] {
  return splitByWeights(100, shares).map((l) => l.amountCents);
}

/**
 * Divisão de uma despesa. A regra é sempre a proporção do projeto; ao editar uma
 * despesa antiga, mantém a proporção com que ela foi lançada (se a do projeto
 * mudou depois, editar o valor não reescreve o passado).
 */
export function splitForExpense(
  totalCents: number,
  members: Share[],
  previous?: SplitLine[],
): SplitLine[] {
  const prevTotal = previous?.reduce((acc, l) => acc + l.amountCents, 0) ?? 0;
  if (!previous || prevTotal === 0) return splitByWeights(totalCents, members);
  const weights = members.map((m) => ({
    userId: m.userId,
    weight: previous.find((l) => l.userId === m.userId)?.amountCents ?? 0,
  }));
  return splitByWeights(totalCents, weights);
}

export function splitTotal(lines: SplitLine[]): number {
  return lines.reduce((acc, l) => acc + l.amountCents, 0);
}
