import { describe, expect, it } from "vitest";
import { expenseImpact, suggestTransfers } from "./balances";

describe("suggestTransfers", () => {
  it("casal: um único pagamento", () => {
    expect(suggestTransfers({ ana: 2500, beto: -2500 })).toEqual([
      { from: "beto", to: "ana", amountCents: 2500 },
    ]);
  });
  it("quitado: nada a pagar", () => {
    expect(suggestTransfers({ ana: 0, beto: 0 })).toEqual([]);
  });
  it("três pessoas zeram todo mundo", () => {
    const nets = { a: 5000, b: -3000, c: -2000 };
    const t = suggestTransfers(nets);
    expect(t).toEqual([
      { from: "b", to: "a", amountCents: 3000 },
      { from: "c", to: "a", amountCents: 2000 },
    ]);
  });
});

describe("expenseImpact", () => {
  const splits = [
    { userId: "ana", amountCents: 6000 },
    { userId: "beto", amountCents: 4000 },
  ];
  it("quem pagou emprestou a parte do outro", () => {
    expect(expenseImpact({ paidBy: "ana", amountCents: 10000 }, splits, "ana")).toBe(4000);
  });
  it("quem não pagou pegou emprestado a própria parte", () => {
    expect(expenseImpact({ paidBy: "ana", amountCents: 10000 }, splits, "beto")).toBe(-4000);
  });
  it("despesa pessoal não mexe no saldo", () => {
    expect(
      expenseImpact({ paidBy: "ana", amountCents: 500 }, [{ userId: "ana", amountCents: 500 }], "ana"),
    ).toBe(0);
  });
});
