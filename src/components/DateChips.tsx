import { Chip } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/dates";

/** Hoje · Ontem · Anteontem · 📅 Outra (calendário nativo). Usado no lançamento e no acerto. */
export function DateChips({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const dayBefore = addDaysISO(today, -2);
  const other = ![today, yesterday, dayBefore].includes(value);

  return (
    <div className="chips" role="group" aria-label="Data">
      <Chip active={value === today} onClick={() => onChange(today)}>
        Hoje
      </Chip>
      <Chip active={value === yesterday} onClick={() => onChange(yesterday)}>
        Ontem
      </Chip>
      <Chip active={value === dayBefore} onClick={() => onChange(dayBefore)}>
        Anteontem
      </Chip>
      {/* input de data invisível por cima do chip: tocar abre o calendário nativo */}
      <label className={`chip date-pick ${other ? "active" : ""}`}>
        📅 {other ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : "Outra"}
        <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Outra data" />
      </label>
    </div>
  );
}
