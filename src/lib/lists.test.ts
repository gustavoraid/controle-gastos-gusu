import { describe, expect, it } from "vitest";
import { applyOps, newItemKey, pendingCount, splitItems, type ListItem } from "./lists";
import { reorderKeys } from "./order";

const it_ = (id: string, sortKey: number, doneAt: string | null = null, text = id): ListItem => ({
  id,
  listId: "L",
  text,
  sortKey,
  doneAt,
  doneBy: doneAt ? "u1" : null,
  createdBy: "u1",
  createdAt: "2026-11-20T10:00:00Z",
});

describe("splitItems", () => {
  it("pendentes por prioridade (maior em cima) e concluídos do mais recente", () => {
    const { pending, done } = splitItems([
      it_("a", 1),
      it_("b", 5),
      it_("c", 3, "2026-11-20T10:00:00Z"),
      it_("d", 9, "2026-11-20T12:00:00Z"),
    ]);
    expect(pending.map((i) => i.id)).toEqual(["b", "a"]);
    expect(done.map((i) => i.id)).toEqual(["d", "c"]);
  });
});

describe("newItemKey", () => {
  it("entra no fim, abaixo até dos concluídos", () => {
    expect(newItemKey([])).toBe(0);
    expect(newItemKey([it_("a", 3), it_("b", -2.5, "2026-11-20T10:00:00Z")])).toBe(-4);
    const items = [it_("a", 3), it_("b", 1)];
    const n = it_("n", newItemKey(items));
    expect(splitItems([...items, n]).pending.at(-1)!.id).toBe("n");
  });
});

describe("applyOps", () => {
  it("adicionar, editar, concluir e apagar aparecem antes da confirmação do servidor", () => {
    const server = [it_("a", 2), it_("b", 1)];
    const out = applyOps(server, [
      { kind: "add", item: it_("n", 0, null, "Ovos") },
      { kind: "update", id: "a", listId: "L", patch: { doneAt: "2026-11-20T11:00:00Z", doneBy: "u2" } },
      { kind: "update", id: "n", listId: "L", patch: { text: "Ovos (12)" } },
      { kind: "delete", id: "b", listId: "L" },
    ]);
    const { pending, done } = splitItems(out);
    expect(pending.map((i) => i.text)).toEqual(["Ovos (12)"]);
    expect(done.map((i) => i.id)).toEqual(["a"]);
  });
  it("item que já chegou do servidor não duplica nem é sobrescrito pelo 'add' da fila", () => {
    const server = [it_("n", 0, null, "Ovos (do servidor)")];
    expect(applyOps(server, [{ kind: "add", item: it_("n", 0, null, "Ovos") }])).toEqual(server);
  });
  it("operação sobre item que o outro apagou é ignorada", () => {
    expect(applyOps([], [{ kind: "update", id: "x", listId: "L", patch: { text: "?" } }])).toEqual([]);
  });
  it("desmarcar volta à posição que o item tinha", () => {
    const server = [it_("a", 3), it_("b", 2, "2026-11-20T10:00:00Z"), it_("c", 1)];
    const out = applyOps(server, [{ kind: "update", id: "b", listId: "L", patch: { doneAt: null, doneBy: null } }]);
    expect(splitItems(out).pending.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("reordenar pendentes com reorderKeys reaproveita as chaves deles", () => {
    const { pending } = splitItems([it_("a", 3), it_("b", 2), it_("c", 1)]);
    const changes = reorderKeys(
      pending.map((i) => ({ id: i.id, key: i.sortKey })),
      ["c", "a", "b"],
    );
    const out = applyOps(
      pending,
      changes.map((c) => ({ kind: "update" as const, id: c.id, listId: "L", patch: { sortKey: c.key } })),
    );
    expect(splitItems(out).pending.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("pendingCount", () => {
  it("conta só os não concluídos", () => {
    expect(pendingCount([{ doneAt: null }, { doneAt: "x" }, { doneAt: null }])).toBe(2);
  });
});
