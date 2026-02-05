export interface Note {
  id: string;
  title: string;
  content: string;
  icon: string;
  order: number;
  archived: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItem {
  id: string;
  title: string;
  content: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  icon: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}
