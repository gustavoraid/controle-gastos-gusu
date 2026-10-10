import { useState, type FormEvent } from "react";
import { ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useProject } from "@/hooks/useProject";
import { back } from "@/hooks/useRoute";
import { addSettlement, newId } from "@/lib/api";
import { suggestTransfers } from "@/lib/balances";
import { todayISO } from "@/lib/dates";
import { centsToInput, formatBRL, parseAmountToCents } from "@/lib/money";
import type { Member } from "@/lib/types";

export function Settle({ projectId, me }: { projectId: string; me: string }) {
  const proj = useProject(projectId);
  if (proj.error) {
    return (
      <>
        <Header title="Acertar contas" onBack={() => back(`/p/${projectId}`)} />
        <main className="page">
          <ErrorBox message={proj.error} />
        </main>
      </>
    );
  }
  if (!proj.data) return <Loading />;
  return <SettleForm projectId={projectId} me={me} members={proj.data.members} balances={proj.data.balances} />;
}

function SettleForm(props: { projectId: string; me: string; members: Member[]; balances: Record<string, number> }) {
  const { projectId, me, members } = props;
  const transfers = suggestTransfers(props.balances);
  const suggestion = transfers.find((t) => t.from === me || t.to === me) ?? transfers[0];
  const other = members.find((m) => m.userId !== me)?.userId ?? me;

  const [from, setFrom] = useState(suggestion?.from ?? me);
  const [to, setTo] = useState(suggestion?.to ?? other);
  const [amount, setAmount] = useState(suggestion ? centsToInput(suggestion.amountCents) : "");
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(newId);

  const name = (uid: string) => (uid === me ? "Eu" : members.find((m) => m.userId === uid)?.name ?? "?");
  const cents = parseAmountToCents(amount);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents || from === to) return;
    setBusy(true);
    try {
      await addSettlement({ id: draftId, projectId, fromUser: from, toUser: to, amountCents: cents, settledOn: todayISO(), me });
      haptic();
      toast.ok("Pagamento registrado");
      back(`/p/${projectId}`);
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Acertar contas" onBack={() => back(`/p/${projectId}`)} />
      <form className="page stack" onSubmit={submit}>
        <p className="muted">Registre um Pix/transferência entre vocês. Isso zera (ou reduz) o saldo.</p>

        <div className="settle-flow">
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Quem pagou">
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {name(m.userId)}
              </option>
            ))}
          </select>
          <span className="muted">pagou para</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Quem recebeu">
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {name(m.userId)}
              </option>
            ))}
          </select>
        </div>

        <label className="amount-field">
          <span className="currency">R$</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0,00" aria-label="Valor" />
        </label>

        {suggestion && (
          <p className="muted small">
            Saldo atual: {name(suggestion.from)} deve {formatBRL(suggestion.amountCents)} a {name(suggestion.to)}.
          </p>
        )}
        {from === to && <p className="text-err small">Escolha duas pessoas diferentes.</p>}

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !cents || from === to}>
            {busy ? "Salvando…" : "Registrar pagamento"}
          </button>
        </div>
      </form>
    </>
  );
}
