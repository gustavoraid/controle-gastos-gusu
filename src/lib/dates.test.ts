import { describe, expect, it } from "vitest";
import { addDaysISO, dayLabel, monthLabel, monthRange, shiftMonth, todayISO } from "./dates";

describe("datas", () => {
  it("hoje usa o fuso de Brasília, não UTC", () => {
    // 22h em São Paulo já é dia seguinte em UTC.
    expect(todayISO(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-10");
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
});
