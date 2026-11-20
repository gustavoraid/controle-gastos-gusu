import { describe, expect, it } from "vitest";
import { launchRoute, pickHomeProject } from "./launch";

describe("launchRoute", () => {
  it("tela inicial vai para o último lugar aberto: projeto ou lista", () => {
    expect(launchRoute("", "/p/p1")).toBe("/p/p1");
    expect(launchRoute("#/", "/p/p1")).toBe("/p/p1");
    expect(launchRoute("#/", "/l/l1")).toBe("/l/l1");
  });
  it("sem último lugar, valor estranho ou com outra rota, não mexe", () => {
    expect(launchRoute("#/", null)).toBeNull();
    expect(launchRoute("#/", "/p/p1/config")).toBeNull();
    expect(launchRoute("#/add/casa", "/p/p1")).toBeNull();
    expect(launchRoute("#/p/p2", "/l/l1")).toBeNull();
  });
});

describe("pickHomeProject", () => {
  const p = (id: string, type: "casa" | "viagem" | "outros", archived = false) => ({ id, type, archived });
  it("primeiro projeto Casa que não está arquivado", () => {
    expect(pickHomeProject([p("v", "viagem"), p("c1", "casa", true), p("c2", "casa"), p("c3", "casa")])?.id).toBe("c2");
  });
  it("sem Casa ativa → null", () => {
    expect(pickHomeProject([p("v", "viagem"), p("c1", "casa", true)])).toBeNull();
  });
});
