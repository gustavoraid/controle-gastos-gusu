import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  dayLabel,
  monthLabel,
  monthRange,
  navigableMonths,
  shiftMonth,
  shortDayLabel,
  stepMonth,
  todayISO,
} from "./dates";

describe("datas", () => {
  it("hoje usa o fuso do aparelho, não UTC", () => {
    // 22h em São Paulo (fuso fixado nos testes) já é dia seguinte em UTC.
    expect(todayISO(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-10");
  });
  it("viajando, hoje é o dia do lugar onde o celular está", () => {
    // 04h10 UTC: já é dia 10 em Brasília, ainda é dia 9 às 23h10 em Lima.
    const agora = new Date("2026-10-10T04:10:00Z");
    expect(todayISO(agora, "America/Sao_Paulo")).toBe("2026-10-10");
    expect(todayISO(agora, "America/Lima")).toBe("2026-10-09");
  });
  it("soma dias atravessando mês", () => {
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("intervalo do mês", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
  it("navega meses atravessando ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("rótulos", () => {
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
    expect(dayLabel("2026-10-10", "2026-10-10")).toBe("Hoje");
    expect(dayLabel("2026-10-09", "2026-10-10")).toBe("Ontem");
  });
  it("meses navegáveis: só os com lançamento, mais o corrente", () => {
    expect(navigableMonths(["2026-10", "2023-08", "2026-10", "2026-11"], "2026-10")).toEqual([
      "2023-08",
      "2026-10",
      "2026-11",
    ]);
    expect(navigableMonths([], "2026-10")).toEqual(["2026-10"]);
  });
  it("navegação pula meses vazios", () => {
    const meses = ["2023-08", "2023-10", "2026-10"];
    expect(stepMonth(meses, "2026-10", -1)).toBe("2023-10");
    expect(stepMonth(meses, "2023-10", -1)).toBe("2023-08");
    expect(stepMonth(meses, "2023-08", -1)).toBeNull();
    expect(stepMonth(meses, "2023-08", 1)).toBe("2023-10");
    expect(stepMonth(meses, "2026-10", 1)).toBeNull();
    // mês atual fora da lista (lançamento apagado): ainda acha os vizinhos
    expect(stepMonth(meses, "2024-05", 1)).toBe("2026-10");
  });
  it("data curta na linha", () => {
    expect(shortDayLabel("2026-10-10", "2026-10-10")).toBe("Hoje");
    expect(shortDayLabel("2026-10-09", "2026-10-10")).toBe("Ontem");
    expect(shortDayLabel("2026-10-03", "2026-10-10")).toBe("sáb., 03");
  });
});
