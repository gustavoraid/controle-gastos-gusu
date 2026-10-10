import { describe, expect, it } from "vitest";
import { formatMoney, minorToInput, parseAmountMinor, parseRate, toBrlCents } from "./currency";

describe("toBrlCents", () => {
  it("real não converte", () => {
    expect(toBrlCents(1234, "BRL", 1)).toBe(1234);
  });
  it("peso chileno (sem centavos)", () => {
    // CLP 25.000 × 0,0062 = R$ 155,00
    expect(toBrlCents(25000, "CLP", 0.0062)).toBe(15500);
  });
  it("dólar com centavos, igual ao banco", () => {
    // USD 10,01 × 5,45 = R$ 54,5545 → 5455
    expect(toBrlCents(1001, "USD", 5.45)).toBe(5455);
  });
  it("meio centavo arredonda para cima (como o round do Postgres)", () => {
    // USD 0,01 × 0,5 = R$ 0,005 → 1 centavo
    expect(toBrlCents(1, "USD", 0.5)).toBe(1);
    // USD 0,03 × 0,5 = 0,015 → 2
    expect(toBrlCents(3, "USD", 0.5)).toBe(2);
  });
  it("cotação com 8 casas sem erro de ponto flutuante", () => {
    // CLP 1.000.000 × 0,00618123 = R$ 6.181,23
    expect(toBrlCents(1_000_000, "CLP", 0.00618123)).toBe(618123);
  });
});

describe("valores por moeda", () => {
  it("lê valor conforme as casas da moeda", () => {
    expect(parseAmountMinor("25.000", "CLP")).toBe(25000);
    expect(parseAmountMinor("25000", "CLP")).toBe(25000);
    expect(parseAmountMinor("10,50", "USD")).toBe(1050);
    expect(parseAmountMinor("25,5", "CLP")).toBeNull();
  });
  it("volta para texto editável", () => {
    expect(minorToInput(25000, "CLP")).toBe("25000");
    expect(minorToInput(1050, "USD")).toBe("10,50");
  });
  it("formata com o símbolo e casas certas", () => {
    expect(formatMoney(25000, "CLP")).toBe("CLP 25.000");
    expect(formatMoney(1050, "USD")).toBe("US$ 10,50");
    expect(formatMoney(1050, "BRL")).toBe("R$ 10,50");
  });
});

describe("parseRate", () => {
  it.each([
    ["5,45", 5.45],
    ["0,0062", 0.0062],
    ["0.00618123", 0.00618123],
  ])("lê %j", (input, value) => {
    expect(parseRate(input)).toBe(value);
  });
  it.each(["", "0", "-1", "abc", "1,123456789"])("rejeita %j", (input) => {
    expect(parseRate(input)).toBeNull();
  });
});
