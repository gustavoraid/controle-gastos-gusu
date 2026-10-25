import { useState, type FormEvent } from "react";
import { DateChips } from "@/components/DateChips";
import { Avatar, ErrorBox, Header, Loading, PERSON_COLORS, haptic, toast } from "@/components/ui";
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
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [draftId] = useState(newId);

  const member = (uid: string) => members.find((m) => m.userId === uid);
  const name = (uid: string) => member(uid)?.name ?? "?";
  const color = (uid: string) => PERSON_COLORS[Math.max(0, members.findIndex((m) => m.userId === uid)) % PERSON_COLORS.length];
  const cents = parseAmountToCents(amount);

  // São só duas pessoas: inverter troca quem paga e quem recebe.
  function swap() {
    setFrom(to);
    setTo(from);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents || from === to) return;
    setBusy(true);
    try {
      await addSettlement({ id: draftId, projectId, fromUser: from, toUser: to, amountCents: cents, settledOn: date, me });
      haptic();
      toast.ok("Pagamento registrado");
      back(`/p/${projectId}`);
    } catch (err) {
      toast.err((err as Error).message);
      setBusy(false);
    }
  }

  const person = (uid: string, label: string) => (
    <span className="settle-person">
      <Avatar name={member(uid)?.name ?? "?"} size={40} color={color(uid)} />
      <strong>{name(uid)}</strong>
      <span className="muted small">{label}</span>
    </span>
  );

  return (
    <>
      <Header title="Acertar contas" onBack={() => back(`/p/${projectId}`)} />
      <form className="page stack" onSubmit={submit}>
        <p className="muted">Registre um Pix/transferência entre {members.map((m) => m.name).join(" e ")}. Isso zera (ou reduz) o saldo.</p>

        <div className="settle-flow">
          {person(from, "paga")}
          <button type="button" className="swap-btn" onClick={swap} aria-label="Inverter quem paga e quem recebe">
            <span aria-hidden="true">→</span>
            <span className="small">inverter ⇄</span>
          </button>
          {person(to, "recebe")}
        </div>

        <label className="amount-field">
          <span className="currency">R$</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0,00" aria-label="Valor" />
        </label>

        {suggestion && (
          <p className="muted small">
            Saldo atual:{" "}
            {`${name(suggestion.from)} deve ${formatBRL(suggestion.amountCents)} a ${name(suggestion.to)}.`}
          </p>
        )}

        <div className="field">
          <span>Quando</span>
          <DateChips value={date} onChange={setDate} />
        </div>

        <div className="sticky-actions">
          <button className="btn primary big" disabled={busy || !cents || from === to}>
            {busy ? "Salvando…" : "Registrar pagamento"}
          </button>
        </div>
      </form>
    </>
  );
}
