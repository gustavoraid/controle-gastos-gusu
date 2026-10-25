import { describe, expect, it } from "vitest";
import { shortName } from "./people";

describe("shortName", () => {
  it("duas primeiras letras", () => {
    expect(shortName("Gustavo")).toBe("Gu");
    expect(shortName(" Suellen ")).toBe("Su");
    expect(shortName("Gu")).toBe("Gu");
  });
  it("vazio vira ?", () => {
    expect(shortName("")).toBe("?");
    expect(shortName(null)).toBe("?");
  });
});
