import type { Task } from '@doist/todoist-sdk';
import { dueHasTime } from './due-datetime.js';
import { recurrenceLooksSubDaily } from './recurrence-frequency.js';

export function isEligibleTask(task: Task): boolean {
  if (task.checked || task.isDeleted) return false;
  const due = task.due;
  if (!due?.isRecurring) return false;
  if (dueHasTime(due)) return true;
  return !recurrenceLooksSubDaily(due.string ?? '');
}
