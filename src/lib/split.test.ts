import { describe, expect, it } from "vitest";
import { expenseShares, splitByWeights, splitTotal, weightsToPercents } from "./split";

const casal = [
  { userId: "ana", weight: 60 },
  { userId: "beto", weight: 40 },
];

describe("splitByWeights", () => {
  it("divide 60/40", () => {
    expect(splitByWeights(10000, casal)).toEqual([
      { userId: "ana", amountCents: 6000 },
      { userId: "beto", amountCents: 4000 },
    ]);
  });

  it("nunca perde centavo", () => {
    for (const total of [1, 2, 3, 7, 99, 101, 3333, 99999]) {
      const lines = splitByWeights(total, [
        { userId: "a", weight: 1 },
        { userId: "b", weight: 1 },
        { userId: "c", weight: 1 },
      ]);
      expect(splitTotal(lines)).toBe(total);
    }
  });

  it("centavo ímpar vai para o maior resto, empate para o primeiro", () => {
    expect(splitByWeights(1001, [{ userId: "a", weight: 1 }, { userId: "b", weight: 1 }])).toEqual([
      { userId: "a", amountCents: 501 },
      { userId: "b", amountCents: 500 },
    ]);
    // 70% de 333 = 233,1 / 30% = 99,9 → o centavo vai para quem tem resto ,9
    expect(splitByWeights(333, [{ userId: "a", weight: 70 }, { userId: "b", weight: 30 }])).toEqual([
      { userId: "a", amountCents: 233 },
      { userId: "b", amountCents: 100 },
    ]);
  });

  it("pesos zerados viram divisão igual", () => {
    expect(splitByWeights(100, [{ userId: "a", weight: 0 }, { userId: "b", weight: 0 }])).toEqual([
      { userId: "a", amountCents: 50 },
      { userId: "b", amountCents: 50 },
    ]);
  });

  it("peso zero de um lado = 100% do outro", () => {
    expect(splitByWeights(500, [{ userId: "a", weight: 0 }, { userId: "b", weight: 3 }])).toEqual([
      { userId: "a", amountCents: 0 },
      { userId: "b", amountCents: 500 },
    ]);
  });
});

describe("weightsToPercents", () => {
  it("normaliza pesos arbitrários para 100", () => {
    expect(weightsToPercents([{ userId: "a", weight: 1 }, { userId: "b", weight: 2 }])).toEqual([33, 67]);
    expect(weightsToPercents(casal)).toEqual([60, 40]);
  });
});

describe("expenseShares", () => {
  it("usa a proporção do projeto", () => {
    expect(expenseShares(9000, casal)).toEqual([
      { userId: "ana", amountCents: 5400 },
      { userId: "beto", amountCents: 3600 },
    ]);
  });

  it("desempate do centavo segue o menor userId, não a ordem da lista (igual ao banco)", () => {
    const meio = [
      { userId: "zz", weight: 1 },
      { userId: "aa", weight: 1 },
    ];
    expect(expenseShares(1001, meio)).toEqual([
      { userId: "aa", amountCents: 501 },
      { userId: "zz", amountCents: 500 },
    ]);
  });

  it("nunca perde centavo", () => {
    for (const total of [1, 7, 99, 12345]) {
      expect(splitTotal(expenseShares(total, [{ userId: "a", weight: 33 }, { userId: "b", weight: 67 }]))).toBe(total);
    }
  });
});
