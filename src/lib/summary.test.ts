import { describe, expect, it } from "vitest";
import { splitByRecurrence } from "./summary";

const e = (categoryId: string | null, amountCents: number) => ({ categoryId, amountCents });

describe("splitByRecurrence", () => {
  it("separa pela marcação da categoria e ordena do maior para o menor", () => {
    const r = splitByRecurrence(
      [e("luz", 20000), e("mercado", 50000), e("reforma", 300000), e("mercado", 10000), e("tv", 250000)],
      (id) => id === "reforma" || id === "tv",
    );
    expect(r.recurring).toEqual({
      total: 80000,
      rows: [
        { categoryId: "mercado", cents: 60000 },
        { categoryId: "luz", cents: 20000 },
      ],
    });
    expect(r.nonRecurring).toEqual({
      total: 550000,
      rows: [
        { categoryId: "reforma", cents: 300000 },
        { categoryId: "tv", cents: 250000 },
      ],
    });
  });
  it("sem categoria conta como recorrente; sem nenhuma não recorrente, o grupo fica vazio", () => {
    const r = splitByRecurrence([e(null, 100), e("luz", 200)], () => false);
    expect(r.recurring.total).toBe(300);
    expect(r.nonRecurring).toEqual({ total: 0, rows: [] });
  });
});
