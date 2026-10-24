export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt?: string;
};
