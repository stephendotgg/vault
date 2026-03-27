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
