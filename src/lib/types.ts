export interface Member {
  userId: string;
  name: string;
  weight: number;
}

export type ProjectType = "casa" | "viagem" | "outros";

export const PROJECT_TYPES: { id: ProjectType; label: string }[] = [
  { id: "casa", label: "Casa" },
  { id: "viagem", label: "Viagem" },
  { id: "outros", label: "Outros" },
];

export interface Project {
  id: string;
  name: string;
  emoji: string;
  type: ProjectType;
  defaultCurrency: string;
  /** Duração da viagem em dias (só viagem; null = não informado). */
  tripDays: number | null;
  createdBy: string;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  position: number;
  archived: boolean;
  suggestions: Suggestion[];
}

export interface Suggestion {
  id: string;
  text: string;
  position: number;
}

/** Moeda aceita no projeto; rate = reais por 1 unidade (BRL = 1). */
export interface ProjectCurrency {
  code: string;
  rate: number;
}

export interface Expense {
  id: string;
  projectId: string;
  description: string;
  /** Valor na moeda da despesa, na menor unidade. */
  amount: number;
  currency: string;
  /** Valor em centavos de real pela cotação atual do projeto (é o que entra no saldo). */
  amountCents: number;
  paidBy: string;
  categoryId: string | null;
  spentOn: string;
  createdAt: string;
  /** Ordem dentro do dia: maior = mais acima (nasce com o instante do lançamento). */
  sortKey: number;
}

export interface Settlement {
  id: string;
  projectId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
  settledOn: string;
  createdAt: string;
}

export interface ProjectSummary extends Project {
  members: Member[];
  myNetCents: number;
}
