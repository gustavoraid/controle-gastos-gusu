/** Total por categoria, do maior para o menor. Despesa sem categoria fica em "". */
export interface CategoryGroup {
  total: number;
  rows: { categoryId: string; cents: number }[];
}

/**
 * Separa os gastos do mês entre categorias recorrentes e não recorrentes
 * (marcação da categoria). Sem nenhuma não recorrente, tudo cai em `recurring`.
 */
export function splitByRecurrence(
  expenses: { categoryId: string | null; amountCents: number }[],
  isNonRecurring: (categoryId: string) => boolean,
): { recurring: CategoryGroup; nonRecurring: CategoryGroup } {
  const sums = new Map<string, number>();
  for (const e of expenses) {
    const k = e.categoryId ?? "";
    sums.set(k, (sums.get(k) ?? 0) + e.amountCents);
  }
  const group = (pred: (id: string) => boolean): CategoryGroup => {
    const rows = [...sums.entries()]
      .filter(([id]) => pred(id))
      .map(([categoryId, cents]) => ({ categoryId, cents }))
      .sort((a, b) => b.cents - a.cents);
    return { total: rows.reduce((acc, r) => acc + r.cents, 0), rows };
  };
  return {
    recurring: group((id) => !(id && isNonRecurring(id))),
    nonRecurring: group((id) => !!id && isNonRecurring(id)),
  };
}
