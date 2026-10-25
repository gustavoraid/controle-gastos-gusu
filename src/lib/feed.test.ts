import { describe, expect, it } from "vitest";
import { badgeLabel, buildFeed, feedChanges, feedDay, feedTitle, isUnseen, type LogRow } from "./feed";

const G = "g", S = "s";
const name = (uid: string) => (uid === G ? "Gu" : "Su");
// Intl separa símbolo e número com espaço não separável.
const plain = (xs: string[]) => xs.map((x) => x.replace(/\u00a0/g, " "));
let seq = 0;
const exp = (at: string, by: string, extra: Partial<LogRow> = {}): LogRow => ({
  id: ++seq, projectId: "p", actor: by, entity: "expense", entityId: "e1", action: "created",
  summary: { description: "Jantar", amount: 10000, currency: "PEN", paid_by: by, spent_on: "2026-10-05", category: "Comida" },
  changes: null, createdAt: at, ...extra,
});
const set = (at: string, by: string, from: string, to: string, extra: Partial<LogRow> = {}): LogRow => ({
  id: ++seq, projectId: "p", actor: by, entity: "settlement", entityId: "s1", action: "created",
  summary: { from_user: from, to_user: to, amount_cents: 5000, settled_on: "2026-10-05" },
  changes: null, createdAt: at, ...extra,
});

describe("buildFeed", () => {
  it("ordena pelo momento da ação, mais recente primeiro", () => {
    const f = buildFeed(
      [exp("2026-10-20T10:00:00Z", G, { id: 1 }), exp("2026-10-20T12:00:00Z", S, { id: 2 }), set("2026-10-20T11:00:00Z", S, S, G, { id: 3 })],
      { p: { BRL: 1, PEN: 1.6 } },
    );
    expect(f.map((i) => i.id)).toEqual([2, 3, 1]);
  });
  it("no mesmo instante, o registro mais novo vem antes", () => {
    const f = buildFeed([exp("2026-10-20T10:00:00Z", G, { id: 7 }), exp("2026-10-20T10:00:00Z", G, { id: 8 })], {});
    expect(f.map((i) => i.id)).toEqual([8, 7]);
  });
  it("converte para reais pela cotação do projeto; acerto já é em reais", () => {
    const f = buildFeed([exp("2026-10-20T10:00:00Z", G), set("2026-10-20T09:00:00Z", G, G, S)], { p: { BRL: 1, PEN: 1.6 } });
    expect(f.map((i) => i.brlCents)).toEqual([16000, 5000]);
  });
  it("marca como apagado tudo da despesa que foi excluída depois", () => {
    const f = buildFeed(
      [
        exp("2026-10-20T10:00:00Z", G),
        exp("2026-10-20T11:00:00Z", G, { entityId: "e2" }),
        exp("2026-10-20T12:00:00Z", S, { action: "deleted" }),
      ],
      {},
    );
    expect(f.map((i) => [i.entityId, i.gone])).toEqual([["e1", true], ["e2", false], ["e1", true]]);
  });
  it("respeita o limite", () => {
    const many = Array.from({ length: 60 }, (_, k) => exp(new Date(Date.UTC(2026, 9, 1, 0, k)).toISOString(), G));
    expect(buildFeed(many, {}, 50)).toHaveLength(50);
  });
});

describe("feedTitle", () => {
  const e = exp("2026-10-20T10:00:00Z", S, { summary: { ...exp("", S).summary, description: "Entrada convento" } });
  it("sempre pelo nome curto, nunca 'você'", () => {
    expect(feedTitle(e, name)).toBe("Su lançou Entrada convento");
    expect(feedTitle(exp("2026-10-20T10:00:00Z", G), name)).toBe("Gu lançou Jantar");
  });
  it("edição e exclusão", () => {
    expect(feedTitle({ ...e, action: "updated" }, name)).toBe("Su editou Entrada convento");
    expect(feedTitle({ ...e, action: "deleted" }, name)).toBe("Su apagou Entrada convento");
  });
  it("acerto", () => {
    const a = set("2026-10-20T10:00:00Z", S, S, G);
    expect(feedTitle(a, name)).toBe("Su registrou um pagamento para Gu");
    expect(feedTitle({ ...a, action: "deleted" }, name)).toBe("Su apagou um pagamento para Gu");
  });
  it("acerto registrado por quem recebeu", () => {
    expect(feedTitle(set("2026-10-20T10:00:00Z", G, S, G), name)).toBe("Gu registrou um pagamento de Su para Gu");
  });
});

describe("feedChanges", () => {
  it("lista só o que mudou, em frases curtas", () => {
    const u = exp("2026-10-20T10:00:00Z", S, {
      action: "updated",
      changes: {
        amount: [{ amount: 4000, currency: "PEN" }, { amount: 4500, currency: "PEN" }],
        paid_by: [G, S],
        category: ["Comida", "Passeios"],
        spent_on: ["2026-10-05", "2026-10-06"],
      },
    });
    expect(plain(feedChanges(u, name))).toEqual([
      "valor PEN 40,00 → PEN 45,00",
      "pago por Gu → Su",
      "categoria Comida → Passeios",
      "data 05/10 → 06/10",
    ]);
  });
  it("acerto: valor, data e sentido", () => {
    const u = set("2026-10-20T10:00:00Z", G, G, S, {
      action: "updated",
      changes: { amount_cents: [5000, 7000], settled_on: ["2026-10-05", "2026-10-07"], direction: [[S, G], [G, S]] },
    });
    expect(plain(feedChanges(u, name))).toEqual(["valor R$ 50,00 → R$ 70,00", "data 05/10 → 07/10", "inverteu quem pagou e quem recebeu"]);
  });
  it("criação e exclusão não têm detalhes", () => {
    expect(feedChanges(exp("2026-10-20T10:00:00Z", G), name)).toEqual([]);
  });
});

describe("feedDay e isUnseen", () => {
  it("agrupa pelo dia local da ação", () => {
    // 01:30 UTC de 21/10 ainda é 20/10 em São Paulo
    expect(feedDay({ createdAt: "2026-10-21T01:30:00Z" })).toBe("2026-10-20");
  });
  it("novo = da outra pessoa e depois da última visita", () => {
    const at = "2026-10-20T10:00:00Z";
    const before = Date.parse(at) - 1;
    expect(isUnseen(exp(at, S), G, before)).toBe(true);
    expect(isUnseen(exp(at, G), G, before)).toBe(false);
    expect(isUnseen(exp(at, S), G, Date.parse(at))).toBe(false);
    expect(isUnseen(exp(at, S), G, null)).toBe(false);
  });
});

describe("badgeLabel", () => {
  it("zero não mostra nada; dez ou mais vira 9+", () => {
    expect([0, 1, 9, 10, 42].map(badgeLabel)).toEqual(["", "1", "9", "9+", "9+"]);
  });
});
