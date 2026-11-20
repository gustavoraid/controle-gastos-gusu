import { useEffect, useRef, useState, type FormEvent } from "react";
import { SortableList } from "@/components/SortableList";
import { ErrorBox, Header, Loading, haptic, toast } from "@/components/ui";
import { useList } from "@/hooks/useList";
import { back, go } from "@/hooks/useRoute";
import { listPeople, newId } from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { shortDayLabel } from "@/lib/dates";
import { enqueue, setRejectedHandler } from "@/lib/listQueue";
import { newItemKey, splitItems, type ListItem } from "@/lib/lists";
import { moveItem, reorderKeys } from "@/lib/order";
import { forgetLastPlace, setLastPlace } from "@/lib/storage";

/**
 * Lista compartilhada: adicionar (entra no fim), arrastar para priorizar,
 * marcar como concluído (desce para "Concluídos"). Tudo aparece na hora e é
 * gravado pela fila do aparelho, mesmo com sinal ruim.
 */
export function ListScreen({ id, me }: { id: string; me: string }) {
  const { list, items, error, sync } = useList(id);
  const people = useLoad(() => listPeople(), []);
  const names = people.data ?? new Map<string, string>();
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // "Sincronizando…" só se a gravação demorar: as rápidas (quase todas) não piscam aviso.
  const [slowSync, setSlowSync] = useState(false);
  useEffect(() => {
    if (sync.pending === 0) {
      setSlowSync(false);
      return;
    }
    const t = setTimeout(() => setSlowSync(true), 1000);
    return () => clearTimeout(t);
  }, [sync.pending > 0]);

  useEffect(() => setLastPlace(`/l/${id}`), [id]);
  useEffect(() => setRejectedHandler((msg) => toast.err(`Não foi possível salvar: ${msg}`)), []);
  // Lista apagada (pelo outro, ou link velho): volta para o início.
  useEffect(() => {
    if (error && /0 rows|multiple \(or no\) rows|JSON object requested/i.test(error)) {
      forgetLastPlace(`/l/${id}`);
      go("/", { replace: true });
    }
  }, [error, id]);

  const settings = (
    <button className="icon-btn" aria-label="Ajustes da lista" onClick={() => go(`/l/${id}/config`)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M10.3 3h3.4l.5 2.4 1.7.9 2.3-.9 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.3-.9-1.7.9-.5 2.4h-3.4l-.5-2.4-1.7-.9-2.3.9-1.7-2.9 1.8-1.6v-2.2L4.1 8.3l1.7-2.9 2.3.9 1.7-.9z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );

  if (error && !list) {
    return (
      <>
        <Header title="Lista" onBack={() => back("/")} />
        <main className="page">
          <ErrorBox message={error} />
        </main>
      </>
    );
  }
  if (!list || !items) return <Loading />;

  const { pending, done } = splitItems(items);

  function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    enqueue({
      kind: "add",
      item: {
        id: newId(),
        listId: id,
        text: t.slice(0, 200),
        sortKey: newItemKey(items!),
        doneAt: null,
        doneBy: null,
        createdBy: me,
        createdAt: new Date().toISOString(),
      },
    });
    setText("");
    // Teclado continua aberto para o próximo item.
    input.current?.focus();
  }

  function toggle(item: ListItem) {
    haptic();
    if (item.doneAt) {
      enqueue({ kind: "update", id: item.id, listId: id, patch: { doneAt: null, doneBy: null } });
      return;
    }
    enqueue({ kind: "update", id: item.id, listId: id, patch: { doneAt: new Date().toISOString(), doneBy: me } });
    toast.ok(`“${item.text}” concluído`, {
      label: "Desfazer",
      run: () => enqueue({ kind: "update", id: item.id, listId: id, patch: { doneAt: null, doneBy: null } }),
    });
  }

  function move(from: number, to: number) {
    const order = moveItem(pending, from, to).map((i) => i.id);
    const changes = reorderKeys(
      pending.map((i) => ({ id: i.id, key: i.sortKey })),
      order,
    );
    enqueue(...changes.map((c) => ({ kind: "update" as const, id: c.id, listId: id, patch: { sortKey: c.key } })));
  }

  function saveText(item: ListItem, value: string) {
    setEditing(null);
    const t = value.trim().slice(0, 200);
    if (t && t !== item.text) enqueue({ kind: "update", id: item.id, listId: id, patch: { text: t } });
  }

  function remove(item: ListItem) {
    setEditing(null);
    enqueue({ kind: "delete", id: item.id, listId: id });
  }

  function clearDone() {
    if (!confirm(`Apagar ${done.length} item${done.length > 1 ? "s" : ""} concluído${done.length > 1 ? "s" : ""}?`)) return;
    enqueue(...done.map((i) => ({ kind: "delete" as const, id: i.id, listId: id })));
  }

  return (
    <>
      <Header title={`${list.emoji} ${list.name}`} onBack={() => back("/")} action={settings} />
      <main className="page list-page">
        {/* Etiqueta flutuante: não ocupa espaço, então não empurra a lista. */}
        {sync.pending > 0 && (sync.offline || slowSync) && (
          <p className={`sync-note small${sync.offline ? " offline" : ""}`} role="status">
            {sync.offline
              ? `Sem conexão · ${sync.pending} alteraç${sync.pending > 1 ? "ões guardadas" : "ão guardada"} no aparelho`
              : "Sincronizando…"}
          </p>
        )}

        <form className="add-item" onSubmit={add}>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Adicionar item"
            maxLength={200}
            enterKeyHint="done"
            aria-label="Novo item"
          />
          <button type="submit" className="btn primary" disabled={!text.trim()} aria-label="Adicionar">
            +
          </button>
        </form>

        {pending.length === 0 ? (
          <div className="empty small-empty">
            <p>{done.length > 0 ? "Tudo feito ✨" : "Lista vazia. Adicione o primeiro item acima."}</p>
          </div>
        ) : (
          <SortableList
            className="list list-items"
            items={pending}
            getId={(i) => i.id}
            onMove={move}
            renderItem={(item, handle) => (
              <ItemRow
                item={item}
                editing={editing === item.id}
                onEdit={() => setEditing(item.id)}
                onSave={(v) => saveText(item, v)}
                onDelete={() => remove(item)}
                onToggle={() => toggle(item)}
                handle={handle}
              />
            )}
          />
        )}

        {done.length > 0 && (
          <section className="done-section">
            <div className="row between">
              <button type="button" className="btn link small done-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                {showDone ? "▾" : "▸"} Concluídos ({done.length})
              </button>
              {showDone && (
                <button type="button" className="btn link small danger-link" onClick={clearDone}>
                  Limpar concluídos
                </button>
              )}
            </div>
            {showDone && (
              <ul className="list list-items done">
                {done.map((item) => (
                  <li key={item.id}>
                    <ItemRow
                      item={item}
                      editing={editing === item.id}
                      onEdit={() => setEditing(item.id)}
                      onSave={(v) => saveText(item, v)}
                      onDelete={() => remove(item)}
                      onToggle={() => toggle(item)}
                      meta={`${names.get(item.doneBy ?? "") ?? "?"} · ${shortDayLabel(item.doneAt!.slice(0, 10))}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function ItemRow(props: {
  item: ListItem;
  editing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onDelete: () => void;
  onToggle: () => void;
  handle?: React.ReactNode;
  meta?: string;
}) {
  const { item } = props;
  const [value, setValue] = useState(item.text);
  useEffect(() => setValue(item.text), [item.text, props.editing]);
  const isDone = !!item.doneAt;
  return (
    <div className={`list-item compact item-row${isDone ? " is-done" : ""}`}>
      <button
        type="button"
        className={`check${isDone ? " on" : ""}`}
        onClick={props.onToggle}
        aria-label={isDone ? `Desmarcar ${item.text}` : `Concluir ${item.text}`}
        aria-pressed={isDone}
      >
        {isDone && (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {props.editing ? (
        <form
          className="grow row gap-sm item-edit"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSave(value);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => {
              // Tocar em "apagar" tira o foco do campo: não salva por cima.
              if ((e.relatedTarget as HTMLElement | null)?.dataset.role === "delete") return;
              props.onSave(value);
            }}
            maxLength={200}
            autoFocus
            enterKeyHint="done"
            aria-label="Editar item"
          />
          <button type="button" data-role="delete" className="icon-btn danger" onClick={props.onDelete} aria-label="Apagar item">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      ) : (
        <button type="button" className="grow min0 item-text" onClick={props.onEdit}>
          <span className="item-label">{item.text}</span>
          {props.meta && <span className="muted small">{props.meta}</span>}
        </button>
      )}
      {props.handle}
    </div>
  );
}
