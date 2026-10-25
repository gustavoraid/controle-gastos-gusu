import { parseRate, rateToInput } from "@/lib/currency";
import { parseWeight } from "@/lib/split";
import { parseTripDays } from "@/lib/trip";
import type { Category, Member, Project, ProjectCurrency, ProjectType } from "@/lib/types";

/**
 * Rascunho da tela de ajustes: tudo o que se edita lá fica aqui até o "Salvar"
 * do topo, que grava de uma vez (planChanges diz o que mudou).
 */
export interface SettingsDraft {
  name: string;
  emoji: string;
  type: ProjectType;
  days: string;
  /** Peso de cada membro, na ordem de `members`, como digitado. */
  weights: string[];
  defaultCurrency: string;
  /** Moedas além do real, com a cotação como digitada. */
  currencies: { code: string; rate: string }[];
  /** Na ordem da tela (é a ordem dos botões ao lançar). */
  categories: CategoryDraft[];
}

export interface CategoryDraft {
  /** Identidade na tela (id do banco, ou provisória para as novas). */
  key: string;
  id: string | null;
  name: string;
  emoji: string;
  archived: boolean;
  nonRecurring: boolean;
  suggestions: { key: string; id: string | null; text: string }[];
}

export interface SettingsBase {
  project: Project;
  members: Member[];
  currencies: ProjectCurrency[];
  categories: Category[];
}

const fmtWeight = (w: number) => String(w).replace(".", ",");

export function draftFrom(base: SettingsBase): SettingsDraft {
  const { project } = base;
  return {
    name: project.name,
    emoji: project.emoji,
    type: project.type,
    days: project.tripDays ? String(project.tripDays) : "",
    weights: base.members.map((m) => fmtWeight(m.weight)),
    defaultCurrency: project.defaultCurrency,
    currencies: base.currencies.filter((c) => c.code !== "BRL").map((c) => ({ code: c.code, rate: rateToInput(c.rate) })),
    categories: base.categories.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      archived: c.archived,
      nonRecurring: c.nonRecurring,
      suggestions: c.suggestions.map((s) => ({ key: s.id, id: s.id, text: s.text })),
    })),
  };
}

/** Primeiro problema que impede salvar, em português; null = pode salvar. */
export function validateDraft(d: SettingsDraft): string | null {
  if (!d.name.trim()) return "Dê um nome ao projeto.";
  if (d.type === "viagem" && d.days.trim() && parseTripDays(d.days) === null) return "Informe de 1 a 366 dias de viagem.";
  const w = d.weights.map(parseWeight);
  if (w.some((x) => x === null) || !w.some((x) => (x ?? 0) > 0))
    return "Pesos da divisão: use números (pode ter vírgula) e pelo menos um maior que zero.";
  const bad = d.currencies.find((c) => parseRate(c.rate) === null);
  if (bad) return `Cotação do ${bad.code} inválida.`;
  if (d.categories.some((c) => !c.name.trim())) return "Toda categoria precisa de nome.";
  if (d.categories.some((c) => !c.emoji.trim())) return "Toda categoria precisa de um ícone.";
  return null;
}

export interface ChangePlan {
  project: Partial<{ name: string; emoji: string; type: ProjectType; trip_days: number | null; default_currency: string }> | null;
  /** Novos pesos por userId, se algum mudou. */
  weights: Record<string, number> | null;
  addCurrencies: { code: string; rate: number }[];
  setRates: { code: string; rate: number }[];
  removeCurrencies: string[];
  /** Muda proporção ou cotação de moeda já existente → recalcula as despesas lançadas. */
  recalc: boolean;
  removeCategories: string[];
  updateCategories: {
    id: string;
    patch: Partial<{ name: string; emoji: string; archived: boolean; non_recurring: boolean; position: number }>;
  }[];
  addCategories: {
    name: string;
    emoji: string;
    archived: boolean;
    nonRecurring: boolean;
    position: number;
    suggestions: string[];
  }[];
  removeSuggestions: string[];
  addSuggestions: { categoryId: string; text: string; position: number }[];
}

/** O que gravar para o banco ficar igual ao rascunho. Pressupõe validateDraft === null. */
export function planChanges(base: SettingsBase, d: SettingsDraft): ChangePlan {
  const p = base.project;
  const project: NonNullable<ChangePlan["project"]> = {};
  if (d.name.trim() !== p.name) project.name = d.name.trim();
  if (d.emoji !== p.emoji) project.emoji = d.emoji;
  if (d.type !== p.type) project.type = d.type;
  // Dias só valem para viagem: trocar o tipo mantém o que estava gravado.
  const tripDays = d.type === "viagem" ? parseTripDays(d.days) : p.tripDays;
  if (tripDays !== p.tripDays) project.trip_days = tripDays;
  if (d.defaultCurrency !== p.defaultCurrency) project.default_currency = d.defaultCurrency;

  const nextWeights = base.members.map((m, i) => ({ userId: m.userId, weight: parseWeight(d.weights[i]) ?? 0 }));
  const weightsChanged = nextWeights.some((n, i) => n.weight !== base.members[i].weight);

  const oldRates = new Map(base.currencies.filter((c) => c.code !== "BRL").map((c) => [c.code, c.rate]));
  const draftCodes = new Set(d.currencies.map((c) => c.code));
  const addCurrencies: ChangePlan["addCurrencies"] = [];
  const setRates: ChangePlan["setRates"] = [];
  for (const c of d.currencies) {
    const rate = parseRate(c.rate) as number;
    if (!oldRates.has(c.code)) addCurrencies.push({ code: c.code, rate });
    else if (oldRates.get(c.code) !== rate) setRates.push({ code: c.code, rate });
  }
  const removeCurrencies = [...oldRates.keys()].filter((code) => !draftCodes.has(code));

  const oldCats = new Map(base.categories.map((c) => [c.id, c]));
  const keptIds = new Set(d.categories.flatMap((c) => (c.id ? [c.id] : [])));
  const removeCategories = base.categories.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
  const updateCategories: ChangePlan["updateCategories"] = [];
  const addCategories: ChangePlan["addCategories"] = [];
  const removeSuggestions: string[] = [];
  const addSuggestions: ChangePlan["addSuggestions"] = [];

  d.categories.forEach((c, i) => {
    const position = i + 1;
    const name = c.name.trim();
    const texts = c.suggestions.map((s) => s.text.trim()).filter(Boolean);
    if (!c.id) {
      addCategories.push({ name, emoji: c.emoji, archived: c.archived, nonRecurring: c.nonRecurring, position, suggestions: texts });
      return;
    }
    const old = oldCats.get(c.id)!;
    const patch: ChangePlan["updateCategories"][number]["patch"] = {};
    if (name !== old.name) patch.name = name;
    if (c.emoji !== old.emoji) patch.emoji = c.emoji;
    if (c.archived !== old.archived) patch.archived = c.archived;
    if (c.nonRecurring !== old.nonRecurring) patch.non_recurring = c.nonRecurring;
    if (position !== old.position) patch.position = position;
    if (Object.keys(patch).length) updateCategories.push({ id: c.id, patch });

    const kept = new Set(c.suggestions.flatMap((s) => (s.id ? [s.id] : [])));
    for (const s of old.suggestions) if (!kept.has(s.id)) removeSuggestions.push(s.id);
    let next = Math.max(0, ...old.suggestions.map((s) => s.position));
    for (const s of c.suggestions)
      if (!s.id && s.text.trim()) addSuggestions.push({ categoryId: c.id, text: s.text.trim(), position: ++next });
  });

  return {
    project: Object.keys(project).length ? project : null,
    weights: weightsChanged ? Object.fromEntries(nextWeights.map((n) => [n.userId, n.weight])) : null,
    addCurrencies,
    setRates,
    removeCurrencies,
    recalc: weightsChanged || setRates.length > 0,
    removeCategories,
    updateCategories,
    addCategories,
    removeSuggestions,
    addSuggestions,
  };
}

export function hasChanges(plan: ChangePlan): boolean {
  return (
    plan.project !== null ||
    plan.weights !== null ||
    [
      plan.addCurrencies,
      plan.setRates,
      plan.removeCurrencies,
      plan.removeCategories,
      plan.updateCategories,
      plan.addCategories,
      plan.removeSuggestions,
      plan.addSuggestions,
    ].some((l) => l.length > 0)
  );
}
