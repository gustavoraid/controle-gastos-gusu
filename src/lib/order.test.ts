import { describe, expect, it } from "vitest";
import { moveItem, reorderKeys } from "./order";

describe("moveItem", () => {
  it("move para cima e para baixo", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("reorderKeys", () => {
  const dia = [
    { id: "a", key: 300 },
    { id: "b", key: 200 },
    { id: "c", key: 100 },
  ];

  it("reaproveita as chaves do dia na nova ordem e só devolve o que mudou", () => {
    // c sobe para o topo
    expect(reorderKeys(dia, ["c", "a", "b"])).toEqual([
      { id: "c", key: 300 },
      { id: "a", key: 200 },
      { id: "b", key: 100 },
    ]);
  });

  it("mesma ordem não grava nada", () => {
    expect(reorderKeys(dia, ["a", "b", "c"])).toEqual([]);
  });

  it("trocar dois vizinhos só mexe neles", () => {
    expect(reorderKeys(dia, ["b", "a", "c"])).toEqual([
      { id: "b", key: 300 },
      { id: "a", key: 200 },
    ]);
  });

  it("chaves empatadas (importação) viram distintas e decrescentes", () => {
    const empatado = [
      { id: "x", key: 50 },
      { id: "y", key: 50 },
      { id: "z", key: 50 },
    ];
    const out = reorderKeys(empatado, ["z", "y", "x"]);
    // chaves finais = atuais com as mudanças aplicadas
    const k = { ...Object.fromEntries(empatado.map((o) => [o.id, o.key])), ...Object.fromEntries(out.map((o) => [o.id, o.key])) };
    expect(k.z).toBe(50);
    expect(k.y).toBeLessThan(50);
    expect(k.x).toBeLessThan(k.y);
  });
});
