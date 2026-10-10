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

export type SplitMode = "project" | "equal" | "payer" | "other" | "exact";

/**
 * Monta a divisão de uma despesa conforme o modo escolhido na tela.
 * - project: proporção padrão do projeto
 * - equal:   partes iguais entre todos os membros
 * - payer:   despesa pessoal de quem pagou (ninguém deve nada)
 * - other:   quem pagou adiantou tudo pelo(s) outro(s)
 * - exact:   valores digitados à mão (precisam somar o total)
 */
export function buildSplit(params: {
  mode: SplitMode;
  totalCents: number;
  paidBy: string;
  members: Share[];
  exact?: Record<string, number>;
}): SplitLine[] {
  const { mode, totalCents, paidBy, members, exact } = params;
  switch (mode) {
    case "project":
      return splitByWeights(totalCents, members);
    case "equal":
      return splitByWeights(
        totalCents,
        members.map((m) => ({ userId: m.userId, weight: 1 })),
      );
    case "payer":
      return members.map((m) => ({
        userId: m.userId,
        amountCents: m.userId === paidBy ? totalCents : 0,
      }));
    case "other": {
      const others = members.filter((m) => m.userId !== paidBy);
      const parts = splitByWeights(
        totalCents,
        others.map((m) => ({ userId: m.userId, weight: 1 })),
      );
      return members.map((m) => ({
        userId: m.userId,
        amountCents: parts.find((p) => p.userId === m.userId)?.amountCents ?? 0,
      }));
    }
    case "exact":
      return members.map((m) => ({ userId: m.userId, amountCents: exact?.[m.userId] ?? 0 }));
  }
}

export function splitTotal(lines: SplitLine[]): number {
  return lines.reduce((acc, l) => acc + l.amountCents, 0);
}
