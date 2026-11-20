import { describe, expect, it } from "vitest";
import { averageAt, categoryMonthly, closedMonthIndexes, evolutionWindow, monthlyTotals, vsAverage } from "./evolution";

const r = (spentOn: string, categoryId: string | null, amountCents: number) => ({ spentOn, categoryId, amountCents });

describe("evolutionWindow", () => {
  it("termina no mês atual quando o escolhido está dentro dos 12 meses", () => {
    const w = evolutionWindow("2026-03", "2026-11");
    expect(w).toHaveLength(12);
    expect(w[0]).toBe("2025-12");
    expect(w[11]).toBe("2026-11");
    expect(evolutionWindow("2025-12", "2026-11")[0]).toBe("2025-12");
  });
  it("desloca para terminar no escolhido quando ele cai fora (futuro ou antigo)", () => {
    expect(evolutionWindow("2026-12", "2026-11").slice(-2)).toEqual(["2026-11", "2026-12"]);
    const old = evolutionWindow("2025-11", "2026-11");
    expect(old[0]).toBe("2024-12");
    expect(old[11]).toBe("2025-11");
  });
});

describe("monthlyTotals", () => {
  it("separa recorrentes e não recorrentes por mês, com zero nos meses vazios e fora da janela ignorado", () => {
    const rows = [r("2026-01-05", "luz", 100), r("2026-01-20", "tv", 900), r("2026-03-01", null, 50), r("2025-12-31", "luz", 7)];
    expect(monthlyTotals(rows, ["2026-01", "2026-02", "2026-03"], (id) => id === "tv")).toEqual([
      { month: "2026-01", recurring: 100, nonRecurring: 900 },
      { month: "2026-02", recurring: 0, nonRecurring: 0 },
      { month: "2026-03", recurring: 50, nonRecurring: 0 },
    ]);
  });
});

describe("categoryMonthly", () => {
  it("soma a categoria em cada mês; '' é sem categoria", () => {
    const rows = [r("2026-01-05", "luz", 100), r("2026-01-09", "luz", 20), r("2026-02-01", null, 5), r("2026-02-02", "gas", 3)];
    expect(categoryMonthly(rows, ["2026-01", "2026-02"], "luz")).toEqual([120, 0]);
    expect(categoryMonthly(rows, ["2026-01", "2026-02"], "")).toEqual([0, 5]);
  });
});

describe("média", () => {
  it("só conta meses fechados e arredonda para centavo inteiro", () => {
    const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
    const idx = closedMonthIndexes(months, "2026-11");
    expect(idx).toEqual([0, 1]);
    expect(averageAt([100, 201, 5, 999], idx)).toBe(151);
    expect(averageAt([1, 2], [])).toBe(0);
  });
  it("vsAverage dá a diferença e o percentual, sem percentual com média zero", () => {
    expect(vsAverage(1200, 1000)).toEqual({ diff: 200, pct: 20 });
    expect(vsAverage(500, 1000)).toEqual({ diff: -500, pct: -50 });
    expect(vsAverage(10, 0)).toEqual({ diff: 10, pct: null });
  });
});
