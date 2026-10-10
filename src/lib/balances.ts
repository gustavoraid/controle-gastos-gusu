export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}

/**
 * Transforma saldos líquidos (positivo = tem a receber) no menor conjunto
 * simples de pagamentos para zerar todo mundo. Para um casal vira um único Pix.
 */
export function suggestTransfers(nets: Record<string, number>): Transfer[] {
  const debtors = Object.entries(nets)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, left: -v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  const creditors = Object.entries(nets)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, left: v }))
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));

  const out: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left);
    if (amount > 0) out.push({ from: debtors[d].id, to: creditors[c].id, amountCents: amount });
    debtors[d].left -= amount;
    creditors[c].left -= amount;
    if (debtors[d].left === 0) d++;
    if (creditors[c].left === 0) c++;
  }
  return out;
}

/**
 * Efeito de uma despesa no meu saldo, como o Splitwise mostra na lista:
 * positivo = "você emprestou", negativo = "você pegou emprestado", 0 = não envolve.
 */
export function expenseImpact(
  expense: { paidBy: string; amountCents: number },
  splits: { userId: string; amountCents: number }[],
  me: string,
): number {
  const myShare = splits.find((s) => s.userId === me)?.amountCents ?? 0;
  const paid = expense.paidBy === me ? expense.amountCents : 0;
  return paid - myShare;
}
