import { describe, expect, it } from "vitest";
import { firstGrapheme } from "./emoji";

describe("firstGrapheme", () => {
  it.each([
    ["🦙", "🦙"],
    ["🇵🇪", "🇵🇪"],
    ["👨‍👩‍👧 família", "👨‍👩‍👧"],
    ["👍🏽", "👍🏽"],
    ["  ⛰️ ", "⛰️"],
    ["🦙🇵🇪", "🦙"],
  ])("%j → %j", (input, out) => {
    expect(firstGrapheme(input)).toBe(out);
  });

  it("vazio vira null", () => {
    expect(firstGrapheme("   ")).toBeNull();
  });
});
