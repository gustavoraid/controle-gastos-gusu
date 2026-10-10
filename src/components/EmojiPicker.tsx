import { useState } from "react";
import { Chip } from "@/components/ui";
import { PROJECT_EMOJIS, firstGrapheme } from "@/lib/emoji";

/** Ícones sugeridos + campo para digitar qualquer emoji pelo teclado do celular. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const custom = !PROJECT_EMOJIS.includes(value);
  const [typing, setTyping] = useState("");

  return (
    <div className="stack-sm">
      <div className="chips">
        {custom && (
          <Chip active onClick={() => undefined}>
            <span className="emoji-lg">{value}</span>
          </Chip>
        )}
        {PROJECT_EMOJIS.map((e) => (
          <Chip key={e} active={value === e} onClick={() => onChange(e)}>
            <span className="emoji-lg">{e}</span>
          </Chip>
        ))}
      </div>
      <label className="row gap-sm">
        <span className="muted small">Outro:</span>
        <input
          className="emoji-input"
          value={typing}
          onChange={(e) => {
            const g = firstGrapheme(e.target.value);
            setTyping(g ?? "");
            if (g) onChange(g);
          }}
          placeholder="😀"
          aria-label="Digite outro emoji"
          autoComplete="off"
        />
        <span className="muted small">abra o teclado de emojis e escolha qualquer um</span>
      </label>
    </div>
  );
}
