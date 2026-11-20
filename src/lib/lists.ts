/**
 * Listas compartilhadas (compras, tarefas): lógica pura. O que está na tela =
 * itens do servidor + operações ainda não confirmadas (fila do aparelho), para
 * marcar/adicionar/reordenar aparecer na hora mesmo com sinal ruim.
 */

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  /** Maior = mais acima (prioridade). */
  sortKey: number;
  doneAt: string | null;
  doneBy: string | null;
  createdBy: string;
  createdAt: string;
}

export type ItemPatch = Partial<Pick<ListItem, "text" | "sortKey" | "doneAt" | "doneBy">>;

export type ListOp =
  | { kind: "add"; item: ListItem }
  | { kind: "update"; id: string; listId: string; patch: ItemPatch }
  | { kind: "delete"; id: string; listId: string };

/** Aplica as operações pendentes, na ordem, sobre os itens vindos do servidor. */
export function applyOps(items: ListItem[], ops: ListOp[]): ListItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const op of ops) {
    if (op.kind === "add") {
      // Já chegou do servidor (gravou, mas a confirmação ainda não saiu da fila): mantém o do servidor.
      if (!byId.has(op.item.id)) byId.set(op.item.id, op.item);
    } else if (op.kind === "update") {
      const cur = byId.get(op.id);
      if (cur) byId.set(op.id, { ...cur, ...op.patch });
    } else {
      byId.delete(op.id);
    }
  }
  return [...byId.values()];
}

/** Pendentes por prioridade (maior sortKey em cima); concluídos do mais recente para o mais antigo. */
export function splitItems(items: ListItem[]): { pending: ListItem[]; done: ListItem[] } {
  const pending = items
    .filter((i) => !i.doneAt)
    .sort((a, b) => b.sortKey - a.sortKey || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const done = items
    .filter((i) => i.doneAt)
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!) || a.id.localeCompare(b.id));
  return { pending, done };
}

/**
 * sortKey de um item novo: entra no FIM da lista (decisão do dono). Fica abaixo
 * de todos, inclusive dos concluídos — desmarcar um antigo não o joga para baixo do novo.
 */
export function newItemKey(items: ListItem[]): number {
  if (items.length === 0) return 0;
  return Math.floor(Math.min(...items.map((i) => i.sortKey))) - 1;
}

/** Quantos faltam (para a tela inicial). */
export function pendingCount(items: { doneAt: string | null }[]): number {
  return items.filter((i) => !i.doneAt).length;
}
