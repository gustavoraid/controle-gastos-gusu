export interface Keyed {
  id: string;
  key: number;
}

/**
 * Nova ordem manual dos itens de um dia (ids de cima para baixo) → sort_key a
 * gravar. Reaproveita as chaves que o dia já tinha (maior = mais acima), então
 * nada sai do dia nem se mistura com outros dias. Chaves repetidas viram
 * distintas. Devolve só os itens cuja chave mudou.
 */
export function reorderKeys(items: Keyed[], orderedIds: string[]): Keyed[] {
  const keys = items.map((i) => i.key).sort((a, b) => b - a);
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] >= keys[i - 1]) keys[i] = keys[i - 1] - 0.001;
  }
  const current = new Map(items.map((i) => [i.id, i.key]));
  return orderedIds
    .map((id, idx) => ({ id, key: keys[idx] }))
    .filter((n) => current.get(n.id) !== n.key);
}

/** Move o item da posição `from` para `to` (como no arrastar). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
