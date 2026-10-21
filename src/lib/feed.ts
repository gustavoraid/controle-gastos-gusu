import { formatMoney, toBrlCents } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

/** Uma linha de `activity_log`: quem criou, editou ou apagou uma despesa ou um acerto. */
export interface LogRow {
  id: number;
  projectId: string;
  actor: string | null;
  entity: "expense" | "settlement";
  entityId: string;
  action: "created" | "updated" | "deleted";
  /** Estado depois da ação (na exclusão, o que foi apagado). */
  summary: Record<string, any>;
  /** Só na edição: { campo: [antes, depois] }. */
  changes: Record<string, [any, any]> | null;
  createdAt: string;
}

export type FeedItem = LogRow & {
  /** Valor da despesa em reais pela cotação atual do projeto (acerto já é em reais). */
  brlCents: number;
  /** A despesa/acerto não existe mais (apagado aqui ou numa atividade posterior). */
  gone: boolean;
};

/**
 * Registro do mais recente para o mais antigo (pelo momento da ação, não pela
 * data da despesa). É o espelho do que vira notificação.
 */
export function buildFeed(rows: LogRow[], rates: Record<string, Record<string, number>>, limit = 50): FeedItem[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
  const deleted = new Set(sorted.filter((r) => r.action === "deleted").map((r) => r.entityId));
  return sorted.slice(0, limit).map((r) => {
    const s = r.summary;
    const brlCents =
      r.entity === "expense"
        ? toBrlCents(Number(s.amount), s.currency, rates[r.projectId]?.[s.currency] ?? (s.currency === "BRL" ? 1 : 0))
        : Number(s.amount_cents);
    return { ...r, brlCents, gone: deleted.has(r.entityId) };
  });
}

/** Dia (no fuso do aparelho) em que a ação aconteceu, para agrupar o feed. */
export function feedDay(item: { createdAt: string }): string {
  return todayISO(new Date(item.createdAt));
}

const VERB = {
  expense: { created: "lançou", updated: "editou", deleted: "apagou" },
  settlement: { created: "registrou", updated: "editou", deleted: "apagou" },
} as const;

/** "Suellen lançou Jantar" / "Você apagou um pagamento para Suellen" etc. */
export function feedTitle(item: LogRow, me: string, name: (uid: string) => string): string {
  const person = (uid: string | null, cap: boolean) => (uid === me ? (cap ? "Você" : "você") : uid ? name(uid) : "?");
  const who = person(item.actor, true);
  const verb = VERB[item.entity][item.action];
  if (item.entity === "expense") return `${who} ${verb} ${item.summary.description}`;
  const { from_user: from, to_user: to } = item.summary;
  if (from === item.actor) return `${who} ${verb} um pagamento para ${person(to, false)}`;
  return `${who} ${verb} um pagamento de ${person(from, false)} para ${person(to, false)}`;
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** O que mudou numa edição, em frases curtas: "valor PEN 40,00 → PEN 45,00". */
export function feedChanges(item: LogRow, me: string, name: (uid: string) => string): string[] {
  if (item.action !== "updated" || !item.changes) return [];
  const person = (uid: string) => (uid === me ? "você" : name(uid));
  const c = item.changes;
  const out: string[] = [];
  if (c.description) out.push(`descrição “${c.description[0]}” → “${c.description[1]}”`);
  if (c.amount) {
    const [a, b] = c.amount;
    out.push(`valor ${formatMoney(Number(a.amount), a.currency)} → ${formatMoney(Number(b.amount), b.currency)}`);
  }
  if (c.amount_cents) out.push(`valor ${formatBRL(Number(c.amount_cents[0]))} → ${formatBRL(Number(c.amount_cents[1]))}`);
  if (c.paid_by) out.push(`pago por ${person(c.paid_by[0])} → ${person(c.paid_by[1])}`);
  if (c.category) out.push(`categoria ${c.category[0] ?? "?"} → ${c.category[1] ?? "?"}`);
  if (c.spent_on) out.push(`data ${shortDate(c.spent_on[0])} → ${shortDate(c.spent_on[1])}`);
  if (c.settled_on) out.push(`data ${shortDate(c.settled_on[0])} → ${shortDate(c.settled_on[1])}`);
  if (c.direction) out.push("inverteu quem pagou e quem recebeu");
  return out;
}

/** Ações da outra pessoa feitas depois da última visita à tela. */
export function isUnseen(item: LogRow, me: string, lastSeen: number | null): boolean {
  return item.actor !== me && lastSeen !== null && Date.parse(item.createdAt) > lastSeen;
}

/** Texto do contador no sino: nada quando zero, "9+" a partir de dez. */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}
