export interface Note {
  id: string;
  title: string;
  content: string;
  icon: string;
  order: number;
  archived: boolean;
  isLocked: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  key: string;
  value: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}
