import { describe, expect, it } from "vitest";
import { splitByWeights, splitForExpense, splitTotal, weightsToPercents } from "./split";

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

describe("splitForExpense", () => {
  it("despesa nova usa a proporção do projeto", () => {
    expect(splitForExpense(9000, casal).map((l) => l.amountCents)).toEqual([5400, 3600]);
  });

  it("ao editar, mantém a proporção original mesmo que a do projeto tenha mudado", () => {
    const original = [
      { userId: "ana", amountCents: 5000 },
      { userId: "beto", amountCents: 5000 },
    ];
    // Projeto agora é 60/40, mas a despesa foi lançada 50/50: novo valor segue 50/50.
    expect(splitForExpense(3001, casal, original)).toEqual([
      { userId: "ana", amountCents: 1501 },
      { userId: "beto", amountCents: 1500 },
    ]);
  });

  it("membro sem parte na despesa original continua sem parte", () => {
    const original = [{ userId: "ana", amountCents: 1000 }];
    expect(splitForExpense(2000, casal, original).map((l) => l.amountCents)).toEqual([2000, 0]);
  });

  it("divisão anterior vazia volta para a proporção do projeto", () => {
    expect(splitForExpense(1000, casal, []).map((l) => l.amountCents)).toEqual([600, 400]);
  });

  it("nunca perde centavo", () => {
    const original = [
      { userId: "ana", amountCents: 333 },
      { userId: "beto", amountCents: 667 },
    ];
    for (const total of [1, 7, 99, 12345]) {
      expect(splitTotal(splitForExpense(total, casal, original))).toBe(total);
    }
  });
});
