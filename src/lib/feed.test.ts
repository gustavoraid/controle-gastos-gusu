import { describe, expect, it } from "vitest";
import { buildFeed, feedDay, feedTitle, isUnseen, type FeedExpense, type FeedSettlement } from "./feed";

const G = "g", S = "s";
const name = (uid: string) => (uid === G ? "Gustavo" : "Suellen");
const exp = (id: string, at: string, by: string, extra: Partial<FeedExpense> = {}): FeedExpense => ({
  id, projectId: "p", description: "Jantar", amount: 10000, currency: "PEN", paidBy: by, createdBy: by, createdAt: at, ...extra,
});
const set = (id: string, at: string, by: string, from: string, to: string): FeedSettlement => ({
  id, projectId: "p", fromUser: from, toUser: to, amountCents: 5000, createdBy: by, createdAt: at,
});

describe("buildFeed", () => {
  it("junta despesas e acertos pelo momento do lançamento, mais recente primeiro", () => {
    const f = buildFeed(
      [exp("e1", "2026-10-20T10:00:00Z", G), exp("e2", "2026-10-20T12:00:00Z", S)],
      [set("s1", "2026-10-20T11:00:00Z", S, S, G)],
      { p: { BRL: 1, PEN: 1.6 } },
    );
    expect(f.map((i) => i.id)).toEqual(["e2", "s1", "e1"]);
  });
  it("converte para reais pela cotação do projeto", () => {
    const [i] = buildFeed([exp("e1", "2026-10-20T10:00:00Z", G)], [], { p: { BRL: 1, PEN: 1.6 } });
    expect(i.kind === "expense" && i.brlCents).toBe(16000);
  });
  it("respeita o limite", () => {
    const many = Array.from({ length: 60 }, (_, k) => exp("e" + k, new Date(Date.UTC(2026, 9, 1, 0, k)).toISOString(), G));
    expect(buildFeed(many, [], {}, 50)).toHaveLength(50);
  });
});

describe("feedTitle", () => {
  const [e] = buildFeed([exp("e1", "2026-10-20T10:00:00Z", S, { description: "Entrada convento" })], [], {});
  it("despesa da outra pessoa e minha", () => {
    expect(feedTitle(e, G, name)).toBe("Suellen lançou Entrada convento");
    expect(feedTitle(e, S, name)).toBe("Você lançou Entrada convento");
  });
  it("acerto", () => {
    const [a] = buildFeed([], [set("s1", "2026-10-20T10:00:00Z", S, S, G)], {});
    expect(feedTitle(a, G, name)).toBe("Suellen registrou um pagamento para você");
    expect(feedTitle(a, S, name)).toBe("Você registrou um pagamento para Gustavo");
  });
  it("acerto registrado por quem recebeu", () => {
    const [a] = buildFeed([], [set("s1", "2026-10-20T10:00:00Z", G, S, G)], {});
    expect(feedTitle(a, G, name)).toBe("Você registrou um pagamento de Suellen para você");
  });
});

describe("feedDay e isUnseen", () => {
  it("dia do lançamento no fuso do aparelho", () => {
    // 01h30 UTC do dia 21 ainda é 22h30 do dia 20 em São Paulo (fuso dos testes)
    expect(feedDay({ createdAt: "2026-10-21T01:30:00Z" })).toBe("2026-10-20");
  });
  it("novo = da outra pessoa e depois da última visita", () => {
    const [e] = buildFeed([exp("e1", "2026-10-20T10:00:00Z", S)], [], {});
    const antes = Date.parse("2026-10-20T09:00:00Z");
    expect(isUnseen(e, G, antes)).toBe(true);
    expect(isUnseen(e, S, antes)).toBe(false);
    expect(isUnseen(e, G, null)).toBe(false);
    expect(isUnseen(e, G, Date.parse("2026-10-20T11:00:00Z"))).toBe(false);
  });
});
