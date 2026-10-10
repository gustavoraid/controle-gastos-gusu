import { describe, expect, it } from "vitest";
import { buildSplit, splitByWeights, splitTotal, weightsToPercents } from "./split";

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

describe("buildSplit", () => {
  const base = { totalCents: 9000, paidBy: "ana", members: casal };

  it("project usa a proporção do projeto", () => {
    expect(buildSplit({ ...base, mode: "project" }).map((l) => l.amountCents)).toEqual([5400, 3600]);
  });
  it("equal ignora a proporção", () => {
    expect(buildSplit({ ...base, mode: "equal" }).map((l) => l.amountCents)).toEqual([4500, 4500]);
  });
  it("payer: despesa pessoal de quem pagou", () => {
    expect(buildSplit({ ...base, mode: "payer" }).map((l) => l.amountCents)).toEqual([9000, 0]);
  });
  it("other: quem pagou adiantou tudo para o outro", () => {
    expect(buildSplit({ ...base, mode: "other" }).map((l) => l.amountCents)).toEqual([0, 9000]);
  });
  it("exact usa os valores digitados", () => {
    const lines = buildSplit({ ...base, mode: "exact", exact: { ana: 1000, beto: 8000 } });
    expect(lines.map((l) => l.amountCents)).toEqual([1000, 8000]);
    expect(splitTotal(lines)).toBe(9000);
  });
});
