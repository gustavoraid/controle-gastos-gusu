import { describe, expect, it } from "vitest";
import { computeNets, expenseImpact, suggestTransfers } from "./balances";

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

describe("computeNets", () => {
  const meio = [
    { userId: "ana", weight: 1 },
    { userId: "beto", weight: 1 },
  ];
  const expenses = [
    { paidBy: "ana", amountCents: 10000 },
    { paidBy: "beto", amountCents: 2000 },
  ];

  it("soma pagou − parte, por pessoa", () => {
    // Ana pagou 100, parte 60 → +40; Beto pagou 20, parte 60 → −40
    expect(computeNets(expenses, [], meio)).toEqual({ ana: 4000, beto: -4000 });
  });

  it("acerto zera o saldo", () => {
    expect(computeNets(expenses, [{ fromUser: "beto", toUser: "ana", amountCents: 4000 }], meio)).toEqual({
      ana: 0,
      beto: 0,
    });
  });

  it("mudar a proporção recalcula tudo, inclusive o que já foi acertado", () => {
    const acerto = [{ fromUser: "beto", toUser: "ana", amountCents: 4000 }];
    const novo = [
      { userId: "ana", weight: 60 },
      { userId: "beto", weight: 40 },
    ];
    // Ana pagou 100, parte 72 (+28); Beto pagou 20, parte 48 (−28). O Pix de 40 já feito
    // passa do ponto: agora é Ana quem deve 12.
    expect(computeNets(expenses, acerto, novo)).toEqual({ ana: -1200, beto: 1200 });
  });

  it("saldos sempre somam zero", () => {
    const nets = computeNets(
      [{ paidBy: "ana", amountCents: 333 }, { paidBy: "beto", amountCents: 1001 }],
      [],
      [{ userId: "ana", weight: 70 }, { userId: "beto", weight: 30 }],
    );
    expect(nets.ana + nets.beto).toBe(0);
  });
});
