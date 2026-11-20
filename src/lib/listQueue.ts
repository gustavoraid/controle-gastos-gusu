import { NetworkError, applyListOp } from "@/lib/api";
import type { ListOp } from "@/lib/lists";

/**
 * Fila de gravação das listas, guardada no aparelho. Cada toque (marcar,
 * adicionar, reordenar) entra aqui, aparece na tela na hora (applyOps) e é
 * enviado em ordem. Sem rede, fica guardado e reenvia quando a conexão volta
 * ou o app volta para a frente — inclusive depois de fechar e abrir o app.
 */

const KEY = "gc:filaListas";
let queue: ListOp[] = load();
/** Confirmadas pelo servidor, mantidas na tela até a próxima recarga da lista (evita "piscar"). */
let confirmed: { op: ListOp; at: number }[] = [];
let offline = false;
const subs = new Set<() => void>();
let onRejected: ((msg: string) => void) | null = null;

function load(): ListOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ListOp[]) : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    /* sem armazenamento: a fila vale só enquanto o app estiver aberto */
  }
}

function notify() {
  for (const s of subs) s();
}

export function subscribeQueue(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Aviso quando o servidor recusa uma operação (não é falta de rede): ela sai da fila. */
export function setRejectedHandler(fn: (msg: string) => void) {
  onRejected = fn;
}

const opList = (op: ListOp) => (op.kind === "add" ? op.item.listId : op.listId);

/** Operações ainda na tela para a lista: pendentes + confirmadas depois de `since` (início da última carga). */
export function opsFor(listId: string, since: number): ListOp[] {
  return [...confirmed.filter((c) => c.at > since).map((c) => c.op), ...queue].filter((op) => opList(op) === listId);
}

export function queueState(): { pending: number; offline: boolean } {
  return { pending: queue.length, offline };
}

export function enqueue(...ops: ListOp[]) {
  queue.push(...ops);
  save();
  notify();
  void flush();
}

let flushing = false;
let retry: ReturnType<typeof setTimeout> | null = null;
let delay = 2000;

export async function flush() {
  if (flushing) return;
  flushing = true;
  if (retry) clearTimeout(retry);
  retry = null;
  try {
    while (queue.length > 0) {
      const op = queue[0];
      try {
        await applyListOp(op);
      } catch (e) {
        if (e instanceof NetworkError) {
          offline = true;
          notify();
          retry = setTimeout(() => void flush(), delay);
          delay = Math.min(delay * 2, 30000);
          return;
        }
        onRejected?.((e as Error).message);
      }
      queue.shift();
      confirmed.push({ op, at: Date.now() });
      if (confirmed.length > 200) confirmed = confirmed.slice(-200);
      offline = false;
      delay = 2000;
      save();
      notify();
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  // O que ficou de uma sessão anterior (app fechado sem rede).
  if (queue.length) setTimeout(() => void flush(), 0);
}
