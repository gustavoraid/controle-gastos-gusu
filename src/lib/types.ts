export interface Member {
  userId: string;
  name: string;
  weight: number;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  createdBy: string;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  position: number;
  archived: boolean;
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
  splits: { userId: string; amountCents: number }[];
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
