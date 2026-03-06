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

export interface Occasion {
  id: string;
  title: string;
  icon: string;
  order: number;
  memories?: Memory[];
  images?: OccasionImage[];
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  content: string;
  order: number;
  occasionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OccasionImage {
  id: string;
  filename: string;
  order: number;
  occasionId: string;
  createdAt: string;
}
