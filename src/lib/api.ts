import { supabase } from "@/lib/supabase";
import type {
  Category,
  Expense,
  Member,
  Project,
  ProjectSummary,
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
  createdBy: r.created_by,
  archived: r.archived,
});

const mapMembers = (rows: any[]): Member[] =>
  rows
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name ?? "?", weight: Number(m.weight) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const mapExpense = (r: any): Expense => ({
  id: r.id,
  projectId: r.project_id,
  description: r.description,
  amountCents: Number(r.amount_cents),
  paidBy: r.paid_by,
  categoryId: r.category_id,
  spentOn: r.spent_on,
  createdAt: r.created_at,
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
      .select("*, project_members(user_id, weight, profiles(display_name))")
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

/** copyFrom: projeto cujas pessoas, proporção, categorias e sugestões serão copiadas. */
export async function createProject(name: string, emoji: string, copyFrom: string | null) {
  return check<string>(
    await supabase.rpc("create_project", { p_name: name, p_emoji: emoji, p_copy_from: copyFrom }),
  );
}

export async function updateProject(id: string, patch: { name?: string; emoji?: string; archived?: boolean }) {
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

export async function listMonth(projectId: string, start: string, end: string) {
  const expenses = await fetchAll<any>((from, to) =>
    supabase
      .from("expenses")
      .select("*")
      .eq("project_id", projectId)
      .gte("spent_on", start)
      .lte("spent_on", end)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const settlements = await fetchAll<any>((from, to) =>
    supabase
      .from("settlements")
      .select("*")
      .eq("project_id", projectId)
      .gte("settled_on", start)
      .lte("settled_on", end)
      .order("settled_on", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return { expenses: expenses.map(mapExpense), settlements: settlements.map(mapSettlement) };
}

export async function getExpense(id: string): Promise<Expense> {
  return mapExpense(
    check(await supabase.from("expenses").select("*").eq("id", id).single()),
  );
}

export async function saveExpense(input: {
  id: string | null;
  projectId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  categoryId: string;
  spentOn: string;
}) {
  const row = {
    project_id: input.projectId,
    description: input.description,
    amount_cents: input.amountCents,
    paid_by: input.paidBy,
    category_id: input.categoryId,
    spent_on: input.spentOn,
  };
  if (input.id) {
    check(await supabase.from("expenses").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.id));
  } else {
    check(await supabase.from("expenses").insert(row));
  }
}

/** Todas as despesas e acertos do projeto (só o necessário para recalcular saldos). */
export async function listAllForBalance(projectId: string) {
  const expenses = await fetchAll<any>((from, to) =>
    supabase.from("expenses").select("id, paid_by, amount_cents").eq("project_id", projectId).order("id").range(from, to),
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
    expenses: expenses.map((e) => ({ paidBy: e.paid_by as string, amountCents: Number(e.amount_cents) })),
    settlements: settlements.map((t) => ({
      fromUser: t.from_user as string,
      toUser: t.to_user as string,
      amountCents: Number(t.amount_cents),
    })),
  };
}

export async function deleteExpense(id: string) {
  check(await supabase.from("expenses").delete().eq("id", id));
}

export async function addSettlement(input: {
  projectId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  settledOn: string;
  me: string;
}) {
  check(
    await supabase.from("settlements").insert({
      project_id: input.projectId,
      from_user: input.fromUser,
      to_user: input.toUser,
      amount_cents: input.amountCents,
      settled_on: input.settledOn,
      created_by: input.me,
    }),
  );
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
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
