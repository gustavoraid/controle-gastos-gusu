import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseAmountToCents } from "./money";

describe("parseAmountToCents", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["0,99", 99],
    ["1.234,56", 123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["12.5", 1250],
    ["R$ 10,00", 1000],
    ["  7 ", 700],
  ])("%s → %d", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "12,345", "1,2,3x", "-5"])("rejeita %j", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});

describe("formatação", () => {
  it("formata em reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
  });
  it("volta para texto editável", () => {
    expect(centsToInput(1250)).toBe("12,50");
    expect(parseAmountToCents(centsToInput(98765))).toBe(98765);
  });
});
