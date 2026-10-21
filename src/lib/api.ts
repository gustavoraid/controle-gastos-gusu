import { toBrlCents } from "@/lib/currency";
import { supabase } from "@/lib/supabase";
import type {
  Category,
  Expense,
  Member,
  Project,
  ProjectCurrency,
  ProjectSummary,
  ProjectType,
  Settlement,
  Suggestion,
} from "@/lib/types";

const FETCH_BATCH = 1000;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message));
  return res.data as T;
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme o e-mail antes de entrar.";
  if (msg.includes("category_suggestions_category_id_text_key")) return "Essa sugestão já existe.";
  if (msg.includes("expenses_category_id_fkey"))
    return "Essa categoria tem despesas. Use “Ocultar do lançamento” em vez de excluir.";
  if (msg.includes("expenses_project_id_currency_fkey"))
    return "Essa moeda tem despesas lançadas e não pode ser removida.";
  if (msg.includes("limite de 2 moedas")) return "O projeto aceita no máximo 2 moedas além do real.";
  if (msg.includes("crie as duas contas")) return "Crie as duas contas no Supabase antes do primeiro projeto.";
  return msg;
}

/** O PostgREST corta respostas em 1000 linhas; busca em lotes até acabar. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<any>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += FETCH_BATCH) {
    const rows = check<T[]>(await build(from, from + FETCH_BATCH - 1));
    out.push(...rows);
    if (rows.length < FETCH_BATCH) return out;
  }
}

const mapProject = (r: any): Project => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  type: r.type,
  defaultCurrency: r.default_currency,
  createdBy: r.created_by,
  archived: r.archived,
});

const mapMembers = (rows: any[]): Member[] =>
  rows
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name ?? "?", weight: Number(m.weight) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const mapCurrencies = (rows: any[]): ProjectCurrency[] =>
  rows
    .map((c) => ({ code: c.code as string, rate: Number(c.rate) }))
    .sort((a, b) => (a.code === "BRL" ? -1 : b.code === "BRL" ? 1 : a.code.localeCompare(b.code)));

/** Cotações do projeto por moeda. */
export type Rates = Record<string, number>;

export const ratesOf = (currencies: ProjectCurrency[]): Rates =>
  Object.fromEntries(currencies.map((c) => [c.code, c.rate]));

const mapExpense = (r: any, rates: Rates): Expense => ({
  id: r.id,
  projectId: r.project_id,
  description: r.description,
  amount: Number(r.amount),
  currency: r.currency,
  amountCents: toBrlCents(Number(r.amount), r.currency, rates[r.currency] ?? 0),
  paidBy: r.paid_by,
  categoryId: r.category_id,
  spentOn: r.spent_on,
  createdAt: r.created_at,
  sortKey: Number(r.sort_key ?? Date.parse(r.created_at) / 1000),
});

const mapSettlement = (r: any): Settlement => ({
  id: r.id,
  projectId: r.project_id,
  fromUser: r.from_user,
  toUser: r.to_user,
  amountCents: Number(r.amount_cents),
  settledOn: r.settled_on,
  createdAt: r.created_at,
});

// ---------------------------------------------------------------- auth

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateError(error.message));
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------- projetos

export async function listProjects(me: string): Promise<ProjectSummary[]> {
  const rows = check<any[]>(
    await supabase
      .from("projects")
      .select("*, project_members(user_id, weight, profiles(display_name))")
      .order("created_at"),
  );
  const balances = check<any[]>(
    await supabase.from("project_balances").select("project_id, net_cents").eq("user_id", me),
  );
  const net = new Map(balances.map((b) => [b.project_id, Number(b.net_cents)]));
  return rows.map((r) => ({
    ...mapProject(r),
    members: mapMembers(r.project_members ?? []),
    myNetCents: net.get(r.id) ?? 0,
  }));
}

export async function getProject(id: string) {
  const r = check<any>(
    await supabase
      .from("projects")
      // projects ↔ project_currencies têm duas ligações (moedas do projeto e moeda padrão):
      // o nome da FK diz ao PostgREST qual usar no embed.
      .select(
        "*, project_members(user_id, weight, profiles(display_name)), project_currencies!project_currencies_project_id_fkey(code, rate)",
      )
      .eq("id", id)
      .single(),
  );
  const cats = check<any[]>(
    await supabase
      .from("categories")
      .select("*, category_suggestions(id, text, position)")
      .eq("project_id", id)
      .order("position"),
  );
  return {
    project: mapProject(r),
    members: mapMembers(r.project_members ?? []),
    currencies: mapCurrencies(r.project_currencies ?? []),
    categories: cats.map(
      (c): Category => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        position: c.position,
        archived: c.archived,
        suggestions: (c.category_suggestions ?? [])
          .map((sg: any) => ({ id: sg.id, text: sg.text, position: sg.position }))
          .sort((a: Suggestion, b: Suggestion) => a.position - b.position || a.text.localeCompare(b.text)),
      }),
    ),
  };
}

export async function getBalances(projectId: string): Promise<Record<string, number>> {
  const rows = check<any[]>(
    await supabase.from("project_balances").select("user_id, net_cents").eq("project_id", projectId),
  );
  return Object.fromEntries(rows.map((r) => [r.user_id, Number(r.net_cents)]));
}

/** copyFrom: projeto cuja proporção, moedas, categorias e sugestões serão copiadas. */
export async function createProject(name: string, emoji: string, type: ProjectType, copyFrom: string | null) {
  return check<string>(
    await supabase.rpc("create_project", {
      p_name: name,
      p_emoji: emoji,
      p_type: type,
      p_copy_from: copyFrom,
    }),
  );
}

export async function updateProject(
  id: string,
  patch: { name?: string; emoji?: string; type?: ProjectType; default_currency?: string; archived?: boolean },
) {
  check(await supabase.from("projects").update(patch).eq("id", id));
}

export async function deleteProject(id: string) {
  check(await supabase.from("projects").delete().eq("id", id));
}

export async function setWeights(projectId: string, weights: Record<string, number>) {
  for (const [userId, weight] of Object.entries(weights)) {
    check(
      await supabase
        .from("project_members")
        .update({ weight })
        .eq("project_id", projectId)
        .eq("user_id", userId),
    );
  }
}

// ---------------------------------------------------------------- moedas

async function getRates(projectId: string): Promise<Rates> {
  const rows = check<any[]>(await supabase.from("project_currencies").select("code, rate").eq("project_id", projectId));
  return ratesOf(mapCurrencies(rows));
}

export async function addCurrency(projectId: string, code: string, rate: number) {
  check(await supabase.from("project_currencies").insert({ project_id: projectId, code, rate }));
}

export async function setRate(projectId: string, code: string, rate: number) {
  check(await supabase.from("project_currencies").update({ rate }).eq("project_id", projectId).eq("code", code));
}

/** Remove uma moeda extra; se ela era a padrão, o real volta a ser o padrão antes. */
export async function removeCurrency(projectId: string, code: string, wasDefault: boolean) {
  if (wasDefault) await updateProject(projectId, { default_currency: "BRL" });
  check(await supabase.from("project_currencies").delete().eq("project_id", projectId).eq("code", code));
}

// ---------------------------------------------------------------- categorias

export async function addCategory(projectId: string, name: string, emoji: string, position: number) {
  check(await supabase.from("categories").insert({ project_id: projectId, name, emoji, position }));
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, "name" | "emoji" | "archived" | "position">>) {
  check(await supabase.from("categories").update(patch).eq("id", id));
}

export async function deleteCategory(id: string) {
  check(await supabase.from("categories").delete().eq("id", id));
}

export async function addSuggestion(categoryId: string, text: string, position: number) {
  check(await supabase.from("category_suggestions").insert({ category_id: categoryId, text, position }));
}

export async function deleteSuggestion(id: string) {
  check(await supabase.from("category_suggestions").delete().eq("id", id));
}

// ---------------------------------------------------------------- despesas

/** Despesas e acertos do projeto num intervalo de datas; sem intervalo, todos (viagem). */
export async function listActivity(projectId: string, range?: { start: string; end: string }) {
  const rates = await getRates(projectId);
  const expenses = await fetchAll<any>((from, to) => {
    let q = supabase.from("expenses").select("*").eq("project_id", projectId);
    if (range) q = q.gte("spent_on", range.start).lte("spent_on", range.end);
    return q
      .order("spent_on", { ascending: false })
      .order("sort_key", { ascending: false })
      .order("id")
      .range(from, to);
  });
  const settlements = await fetchAll<any>((from, to) => {
    let q = supabase.from("settlements").select("*").eq("project_id", projectId);
    if (range) q = q.gte("settled_on", range.start).lte("settled_on", range.end);
    return q.order("settled_on", { ascending: false }).order("id").range(from, to);
  });
  return { expenses: expenses.map((e) => mapExpense(e, rates)), settlements: settlements.map(mapSettlement) };
}

/** Meses ("YYYY-MM") com alguma despesa ou acerto no projeto. */
export async function listActivityMonths(projectId: string): Promise<string[]> {
  const expenses = await fetchAll<any>((from, to) =>
    supabase.from("expenses").select("spent_on").eq("project_id", projectId).order("id").range(from, to),
  );
  const settlements = await fetchAll<any>((from, to) =>
    supabase.from("settlements").select("settled_on").eq("project_id", projectId).order("id").range(from, to),
  );
  const days = [...expenses.map((e) => e.spent_on as string), ...settlements.map((s) => s.settled_on as string)];
  return [...new Set(days.map((d) => d.slice(0, 7)))].sort();
}

export async function getExpense(id: string): Promise<Expense> {
  const r = check<any>(await supabase.from("expenses").select("*").eq("id", id).single());
  return mapExpense(r, await getRates(r.project_id));
}

/**
 * Insere com ID gerado no celular. Se a mesma linha chegar duas vezes (resposta
 * perdida com sinal ruim e o usuário tenta de novo, ou a fila offline reenviando),
 * a segunda é reconhecida pelo ID e ignorada em vez de duplicar.
 */
async function insertOnce(table: "expenses" | "settlements", row: Record<string, unknown>) {
  const { error } = await supabase.from(table).insert(row);
  if (error && !(error.code === "23505" && error.message.includes(`${table}_pkey`))) {
    throw new Error(translateError(error.message));
  }
}

/** ID novo para uma despesa/acerto, gerado uma vez por formulário. */
export function newId(): string {
  return crypto.randomUUID();
}

export async function saveExpense(input: {
  id: string;
  isNew: boolean;
  projectId: string;
  description: string;
  /** Na menor unidade da moeda. */
  amount: number;
  currency: string;
  paidBy: string;
  categoryId: string;
  spentOn: string;
}) {
  const row = {
    id: input.id,
    project_id: input.projectId,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    paid_by: input.paidBy,
    category_id: input.categoryId,
    spent_on: input.spentOn,
  };
  if (input.isNew) {
    await insertOnce("expenses", row);
  } else {
    check(await supabase.from("expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.id));
  }
}

/**
 * Todas as despesas (na moeda original) e acertos do projeto — o necessário para
 * prever o saldo com outra proporção ou outra cotação.
 */
export async function listAllForBalance(projectId: string) {
  const expenses = await fetchAll<any>((from, to) =>
    supabase.from("expenses").select("id, paid_by, amount, currency").eq("project_id", projectId).order("id").range(from, to),
  );
  const settlements = await fetchAll<any>((from, to) =>
    supabase
      .from("settlements")
      .select("id, from_user, to_user, amount_cents")
      .eq("project_id", projectId)
      .order("id")
      .range(from, to),
  );
  return {
    expenses: expenses.map((e) => ({
      paidBy: e.paid_by as string,
      amount: Number(e.amount),
      currency: e.currency as string,
    })),
    settlements: settlements.map((t) => ({
      fromUser: t.from_user as string,
      toUser: t.to_user as string,
      amountCents: Number(t.amount_cents),
    })),
  };
}

/** Grava a nova ordem manual de despesas de um dia (só as que mudaram). */
export async function setSortKeys(changes: { id: string; key: number }[]) {
  for (const c of changes) {
    check(await supabase.from("expenses").update({ sort_key: c.key }).eq("id", c.id));
  }
}

export async function deleteExpense(id: string) {
  check(await supabase.from("expenses").delete().eq("id", id));
}

export async function addSettlement(input: {
  id: string;
  projectId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  settledOn: string;
  me: string;
}) {
  await insertOnce("settlements", {
    id: input.id,
    project_id: input.projectId,
    from_user: input.fromUser,
    to_user: input.toUser,
    amount_cents: input.amountCents,
    settled_on: input.settledOn,
    created_by: input.me,
  });
}

export async function deleteSettlement(id: string) {
  check(await supabase.from("settlements").delete().eq("id", id));
}

// ---------------------------------------------------------------- tempo real

/** Chama onChange quando o outro celular mexe em algo do projeto. */
export function subscribeProject(projectId: string, onChange: () => void) {
  const filter = `project_id=eq.${projectId}`;
  const channel = supabase
    .channel(`project-${projectId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "project_currencies", filter }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
