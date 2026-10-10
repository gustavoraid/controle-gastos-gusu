import { supabase } from "@/lib/supabase";
import type { Category, Expense, Member, Project, ProjectSummary, Settlement } from "@/lib/types";

const FETCH_BATCH = 1000;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message));
  return res.data as T;
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("User already registered")) return "Esse e-mail já tem conta. Entre com a senha.";
  if (msg.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Email not confirmed")) return "Confirme o e-mail antes de entrar.";
  if (msg.includes("violates foreign key") && msg.includes("project_members"))
    return "Essa pessoa tem lançamentos no projeto e não pode sair.";
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
  inviteCode: r.invite_code,
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
  splits: (r.expense_splits ?? []).map((s: any) => ({
    userId: s.user_id,
    amountCents: Number(s.amount_cents),
  })),
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

export async function signUp(email: string, password: string, displayName: string) {
  const data = check(
    await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } }),
  );
  return { needsConfirmation: !data.session };
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
    await supabase.from("categories").select("*").eq("project_id", id).order("position"),
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

export async function createProject(name: string, emoji: string, template: string) {
  return check<string>(
    await supabase.rpc("create_project", { p_name: name, p_emoji: emoji, p_template: template }),
  );
}

export async function joinProject(code: string) {
  return check<string>(await supabase.rpc("join_project", { p_code: code }));
}

export async function updateProject(id: string, patch: { name?: string; emoji?: string; archived?: boolean }) {
  check(await supabase.from("projects").update(patch).eq("id", id));
}

export async function deleteProject(id: string) {
  check(await supabase.from("projects").delete().eq("id", id));
}

export async function leaveProject(id: string, me: string) {
  check(await supabase.from("project_members").delete().eq("project_id", id).eq("user_id", me));
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

// ---------------------------------------------------------------- despesas

export async function listMonth(projectId: string, start: string, end: string) {
  const expenses = await fetchAll<any>((from, to) =>
    supabase
      .from("expenses")
      .select("*, expense_splits(user_id, amount_cents)")
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
    check(await supabase.from("expenses").select("*, expense_splits(user_id, amount_cents)").eq("id", id).single()),
  );
}

export async function saveExpense(input: {
  id: string | null;
  projectId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  categoryId: string | null;
  spentOn: string;
  splits: { userId: string; amountCents: number }[];
}) {
  return check<string>(
    await supabase.rpc("save_expense", {
      p_id: input.id,
      p_project_id: input.projectId,
      p_description: input.description,
      p_amount_cents: input.amountCents,
      p_paid_by: input.paidBy,
      p_category_id: input.categoryId,
      p_spent_on: input.spentOn,
      p_splits: input.splits.map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })),
    }),
  );
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
