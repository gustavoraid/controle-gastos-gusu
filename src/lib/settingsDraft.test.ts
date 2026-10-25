import { describe, expect, it } from "vitest";
import { draftFrom, hasChanges, planChanges, validateDraft, type SettingsBase } from "./settingsDraft";

const base: SettingsBase = {
  project: {
    id: "p", name: "Peru", emoji: "🦙", type: "viagem", defaultCurrency: "PEN", tripDays: 10, createdBy: "g", archived: false,
  },
  members: [
    { userId: "g", name: "Gustavo", weight: 2 },
    { userId: "s", name: "Suellen", weight: 1 },
  ],
  currencies: [
    { code: "BRL", rate: 1 },
    { code: "PEN", rate: 1.58 },
  ],
  categories: [
    { id: "c1", name: "Comida", emoji: "🍽️", position: 1, archived: false, suggestions: [{ id: "s1", text: "Almoço", position: 1 }] },
    { id: "c2", name: "Passeios", emoji: "🏔️", position: 2, archived: false, suggestions: [] },
  ],
};

describe("planChanges", () => {
  it("rascunho intacto não tem mudança", () => {
    const plan = planChanges(base, draftFrom(base));
    expect(hasChanges(plan)).toBe(false);
    expect(plan.recalc).toBe(false);
  });

  it("dados do projeto viram um patch só com o que mudou", () => {
    const d = { ...draftFrom(base), name: " Peru 2026 ", days: "12", defaultCurrency: "BRL" };
    expect(planChanges(base, d).project).toEqual({ name: "Peru 2026", trip_days: 12, default_currency: "BRL" });
  });

  it("apagar os dias grava null; trocar para Casa mantém o que estava", () => {
    expect(planChanges(base, { ...draftFrom(base), days: "" }).project).toEqual({ trip_days: null });
    expect(planChanges(base, { ...draftFrom(base), type: "casa", days: "" }).project).toEqual({ type: "casa" });
  });

  it("peso ou cotação existente pedem recálculo; moeda nova não", () => {
    const w = planChanges(base, { ...draftFrom(base), weights: ["1", "1"] });
    expect(w.weights).toEqual({ g: 1, s: 1 });
    expect(w.recalc).toBe(true);

    const r = planChanges(base, { ...draftFrom(base), currencies: [{ code: "PEN", rate: "1,6" }] });
    expect(r.setRates).toEqual([{ code: "PEN", rate: 1.6 }]);
    expect(r.recalc).toBe(true);

    const add = planChanges(base, { ...draftFrom(base), currencies: [{ code: "PEN", rate: "1,58" }, { code: "USD", rate: "5,4" }] });
    expect(add.addCurrencies).toEqual([{ code: "USD", rate: 5.4 }]);
    expect(add.recalc).toBe(false);
  });

  it("moeda que saiu do rascunho é removida", () => {
    expect(planChanges(base, { ...draftFrom(base), currencies: [] }).removeCurrencies).toEqual(["PEN"]);
  });

  it("categorias: ordem, edição, exclusão e nova com sugestões", () => {
    const d = draftFrom(base);
    const [c1] = d.categories;
    const plan = planChanges(base, {
      ...d,
      categories: [
        { key: "n1", id: null, name: " Táxi ", emoji: "🚕", archived: false, suggestions: [{ key: "x", id: null, text: "Aeroporto" }] },
        { ...c1, emoji: "🍕", suggestions: [{ key: "y", id: null, text: " Jantar " }] },
      ],
    });
    expect(plan.removeCategories).toEqual(["c2"]);
    expect(plan.updateCategories).toEqual([{ id: "c1", patch: { emoji: "🍕", position: 2 } }]);
    expect(plan.addCategories).toEqual([{ name: "Táxi", emoji: "🚕", archived: false, position: 1, suggestions: ["Aeroporto"] }]);
    expect(plan.removeSuggestions).toEqual(["s1"]);
    expect(plan.addSuggestions).toEqual([{ categoryId: "c1", text: "Jantar", position: 2 }]);
  });
});

describe("validateDraft", () => {
  it("aceita o rascunho original", () => {
    expect(validateDraft(draftFrom(base))).toBeNull();
  });
  it("aponta o primeiro problema", () => {
    const d = draftFrom(base);
    expect(validateDraft({ ...d, name: "  " })).toMatch(/nome/);
    expect(validateDraft({ ...d, days: "0" })).toMatch(/dias/);
    expect(validateDraft({ ...d, type: "casa", days: "0" })).toBeNull();
    expect(validateDraft({ ...d, weights: ["0", "0"] })).toMatch(/Pesos/);
    expect(validateDraft({ ...d, currencies: [{ code: "PEN", rate: "x" }] })).toMatch(/PEN/);
    expect(validateDraft({ ...d, categories: [{ ...d.categories[0], name: "" }] })).toMatch(/nome/);
  });
});
