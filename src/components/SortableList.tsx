import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Lista que se reordena arrastando pela alça ≡. Só a alça inicia o arrasto, para
 * não brigar com a rolagem da tela no celular.
 */
export function SortableList<T>(props: {
  items: T[];
  getId: (item: T) => string;
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = props.items.map(props.getId);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    props.onMove(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={props.className}>
          {props.items.map((item) => (
            <SortableRow key={props.getId(item)} id={props.getId(item)}>
              {(handle) => props.renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 5 : undefined,
  };
  const handle = (
    <button type="button" className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Arrastar para reordenar">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M5 8h14M5 12h14M5 16h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? "dragging" : undefined}>
      {children(handle)}
    </li>
  );
}
