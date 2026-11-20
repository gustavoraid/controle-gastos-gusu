import { describe, expect, it } from "vitest";
import {
  LAST_12,
  availableYears,
  averageAt,
  categoryMonthly,
  closedMonthIndexes,
  defaultMonth,
  monthlyAverage,
  monthlyTotals,
  periodMonths,
  vsAverage,
} from "./evolution";

const r = (spentOn: string, categoryId: string | null, amountCents: number) => ({ spentOn, categoryId, amountCents });

describe("periodMonths", () => {
  it("últimos 12 meses terminam no mês atual", () => {
    const w = periodMonths(LAST_12, "2026-11");
    expect(w).toHaveLength(12);
    expect(w[0]).toBe("2025-12");
    expect(w[11]).toBe("2026-11");
  });
  it("um ano vai de janeiro a dezembro", () => {
    const w = periodMonths("2025", "2026-11");
    expect(w[0]).toBe("2025-01");
    expect(w[11]).toBe("2025-12");
  });
});

describe("availableYears / defaultMonth", () => {
  it("anos com lançamento mais o atual, do mais recente ao mais antigo", () => {
    expect(availableYears(["2023-08", "2024-01", "2025-12"], "2026-11")).toEqual(["2026", "2025", "2024", "2023"]);
  });
  it("destaca o mês atual se estiver no período, senão o último", () => {
    expect(defaultMonth(periodMonths("2026", "2026-11"), "2026-11")).toBe("2026-11");
    expect(defaultMonth(periodMonths("2025", "2026-11"), "2026-11")).toBe("2025-12");
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
    // meses antes do primeiro lançamento do projeto não entram
    expect(closedMonthIndexes(["2023-07", "2023-08", "2023-09"], "2026-11", "2023-08")).toEqual([1, 2]);
  });
  it("vsAverage dá a diferença e o percentual, sem percentual com média zero", () => {
    expect(vsAverage(1200, 1000)).toEqual({ diff: 200, pct: 20 });
    expect(vsAverage(500, 1000)).toEqual({ diff: -500, pct: -50 });
    expect(vsAverage(10, 0)).toEqual({ diff: 10, pct: null });
  });
});

describe("monthlyAverage", () => {
  it("é a média dos 12 meses fechados, igual à soma recorrente + não recorrente da Evolução", () => {
    const rows = [r("2026-10-05", "a", 300), r("2026-09-01", "b", 100), r("2026-11-02", "a", 999), r("2025-01-01", "a", 5000)];
    const months = periodMonths(LAST_12, "2026-11");
    const tot = monthlyTotals(rows, months, (id) => id === "b").map((t) => t.recurring + t.nonRecurring);
    const expected = averageAt(tot, closedMonthIndexes(months, "2026-11", "2025-01"));
    expect(monthlyAverage(rows, "2026-11", "2025-01")).toBe(expected);
    expect(expected).toBe(36); // (300 + 100) / 11, mês atual fora
  });
  it("projeto novo: só conta a partir do primeiro mês", () => {
    expect(monthlyAverage([r("2026-09-10", null, 1000), r("2026-10-10", null, 3000)], "2026-11", "2026-09")).toBe(2000);
  });
});
