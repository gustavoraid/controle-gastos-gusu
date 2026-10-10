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

export interface Expense {
  id: string;
  projectId: string;
  description: string;
  amountCents: number;
  paidBy: string;
  categoryId: string | null;
  spentOn: string;
  createdAt: string;
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
