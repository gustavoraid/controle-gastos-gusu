import { describe, expect, it } from "vitest";
import { parseTripDays, perDayCents } from "./trip";

describe("parseTripDays", () => {
  it("aceita inteiros de 1 a 366", () => {
    expect(["1", " 10 ", "366"].map(parseTripDays)).toEqual([1, 10, 366]);
  });
  it("recusa vazio, zero, decimal, negativo e acima de 366", () => {
    expect(["", "0", "2,5", "-3", "367", "abc"].map(parseTripDays)).toEqual([null, null, null, null, null, null]);
  });
});

describe("perDayCents", () => {
  it("divide e arredonda ao centavo", () => {
    expect(perDayCents(100000, 10)).toBe(10000);
    expect(perDayCents(100000, 3)).toBe(33333);
    expect(perDayCents(5, 2)).toBe(3);
  });
});
