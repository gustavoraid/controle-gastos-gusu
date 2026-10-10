import { toBrlCents } from "@/lib/currency";
import { expenseShares, type Share } from "@/lib/split";

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

/** Despesas na moeda original → em centavos de real pelas cotações dadas. */
export function inBrl(
  expenses: { paidBy: string; amount: number; currency: string }[],
  rates: Record<string, number>,
): { paidBy: string; amountCents: number }[] {
  return expenses.map((e) => ({ paidBy: e.paidBy, amountCents: toBrlCents(e.amount, e.currency, rates[e.currency] ?? 0) }));
}

/**
 * Saldo líquido de cada membro (positivo = tem a receber), recalculando todas as
 * despesas pela proporção informada. Mesma conta da view project_balances; serve
 * para prever o efeito de mudar a proporção antes de salvar.
 */
export function computeNets(
  expenses: { paidBy: string; amountCents: number }[],
  settlements: { fromUser: string; toUser: string; amountCents: number }[],
  members: Share[],
): Record<string, number> {
  const nets: Record<string, number> = Object.fromEntries(members.map((m) => [m.userId, 0]));
  for (const e of expenses) {
    nets[e.paidBy] = (nets[e.paidBy] ?? 0) + e.amountCents;
    for (const sh of expenseShares(e.amountCents, members)) nets[sh.userId] -= sh.amountCents;
  }
  for (const t of settlements) {
    nets[t.fromUser] = (nets[t.fromUser] ?? 0) + t.amountCents;
    nets[t.toUser] = (nets[t.toUser] ?? 0) - t.amountCents;
  }
  return nets;
}
