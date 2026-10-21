import { useEffect } from "react";
import { Loading, ToastHost } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { go, useRoute } from "@/hooks/useRoute";
import { supabaseConfigured } from "@/lib/supabase";
import { getLastProject } from "@/lib/storage";
import { ExpenseForm } from "@/screens/ExpenseForm";
import { Activity } from "@/screens/Activity";
import { Login } from "@/screens/Login";
import { NewProject } from "@/screens/NewProject";
import { ProjectScreen } from "@/screens/Project";
import { ProjectSettings } from "@/screens/ProjectSettings";
import { Projects } from "@/screens/Projects";
import { Settle } from "@/screens/Settle";

export function App() {
  return (
    <>
      <Routes />
      <ToastHost />
    </>
  );
}

function Routes() {
  const { session, ready } = useSession();
  const { parts, params } = useRoute();

  // Atalho "Nova despesa" do ícone (manifest shortcuts) → último projeto aberto.
  useEffect(() => {
    if (session && parts[0] === "add") {
      const last = getLastProject();
      go(last ? `/p/${last}/add` : "/", { replace: true });
    }
  }, [session, parts]);

  if (!supabaseConfigured) {
    return (
      <main className="page">
        <h1>Falta configurar o Supabase</h1>
        <p>
          Crie um arquivo <code>.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja{" "}
          <code>.env.example</code>) e rode o build de novo.
        </p>
      </main>
    );
  }
  if (!ready) return <Loading />;
  if (!session) return <Login />;

  const me = session.user.id;
  const [a, b, c] = parts;

  if (a === "novo") return <NewProject me={me} />;
  if (a === "atividades") return <Activity me={me} />;
  if (a === "p" && b) {
    if (c === "add") return <ExpenseForm projectId={b} expenseId={params.get("e")} me={me} />;
    if (c === "acertar") return <Settle projectId={b} me={me} />;
    if (c === "config") return <ProjectSettings projectId={b} me={me} />;
    return <ProjectScreen id={b} me={me} />;
  }
  if (a === "add") return <Loading />;
  return <Projects me={me} />;
}
