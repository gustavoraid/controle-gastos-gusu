import { toBrlCents } from "@/lib/currency";
import { todayISO } from "@/lib/dates";

export interface FeedExpense {
  id: string;
  projectId: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  createdBy: string;
  createdAt: string;
}

export interface FeedSettlement {
  id: string;
  projectId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  createdBy: string;
  createdAt: string;
}

export type FeedItem =
  | ({ kind: "expense"; actor: string; brlCents: number } & FeedExpense)
  | ({ kind: "settlement"; actor: string } & FeedSettlement);

/**
 * Despesas e acertos de todos os projetos, do mais recente para o mais antigo
 * (pelo momento em que foram lançados, não pela data da despesa). É o espelho
 * do que vira notificação: quem lançou o quê, em qual projeto.
 */
export function buildFeed(
  expenses: FeedExpense[],
  settlements: FeedSettlement[],
  rates: Record<string, Record<string, number>>,
  limit = 50,
): FeedItem[] {
  const items: FeedItem[] = [
    ...expenses.map((e): FeedItem => ({
      kind: "expense",
      actor: e.createdBy,
      brlCents: toBrlCents(e.amount, e.currency, rates[e.projectId]?.[e.currency] ?? (e.currency === "BRL" ? 1 : 0)),
      ...e,
    })),
    ...settlements.map((s): FeedItem => ({ kind: "settlement", actor: s.createdBy, ...s })),
  ];
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

/** Dia (no fuso do aparelho) em que o item foi lançado, para agrupar o feed. */
export function feedDay(item: { createdAt: string }): string {
  return todayISO(new Date(item.createdAt));
}

/** "Suellen lançou" / "Você lançou" etc. — a frase principal de cada item. */
export function feedTitle(item: FeedItem, me: string, name: (uid: string) => string): string {
  const who = item.actor === me ? "Você" : name(item.actor);
  if (item.kind === "expense") return `${who} lançou ${item.description}`;
  const to = item.toUser === me ? "você" : name(item.toUser);
  if (item.fromUser === item.actor) return `${who} registrou um pagamento para ${to}`;
  const from = item.fromUser === me ? "você" : name(item.fromUser);
  return `${who} registrou um pagamento de ${from} para ${to}`;
}

/** Itens da outra pessoa lançados depois da última visita à tela. */
export function isUnseen(item: FeedItem, me: string, lastSeen: number | null): boolean {
  return item.actor !== me && lastSeen !== null && Date.parse(item.createdAt) > lastSeen;
}
