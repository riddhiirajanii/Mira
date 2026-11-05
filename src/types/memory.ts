export type MemoryCategory =
  | 'personal'
  | 'preference'
  | 'work'
  | 'topic'
  | 'general';

export type Memory = {
  id: string;
  userId?: string;
  category: MemoryCategory;
  fact: string;
  importance: number; // 1 (minor detail) to 5 (vital fact)
  createdAt: string;
  updatedAt?: string;
};
