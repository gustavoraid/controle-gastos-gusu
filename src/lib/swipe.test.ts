import { describe, expect, it } from "vitest";
import { swipeStep } from "./swipe";

const W = 400;
const at = (x: number, y = 300) => ({ x, y });

describe("swipeStep", () => {
  it("dedo para a esquerda = próximo mês; para a direita = anterior", () => {
    expect(swipeStep(at(300), at(150), W)).toBe(1);
    expect(swipeStep(at(100), at(260), W)).toBe(-1);
  });
  it("arrasto curto ou mais vertical (rolagem) não troca", () => {
    expect(swipeStep(at(200), at(150), W)).toBe(0);
    expect(swipeStep(at(300, 100), at(180, 300), W)).toBe(0);
  });
  it("começar na borda (gesto voltar do Android) não troca", () => {
    expect(swipeStep(at(10), at(200), W)).toBe(0);
    expect(swipeStep(at(392), at(200), W)).toBe(0);
  });
});
