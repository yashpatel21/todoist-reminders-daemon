import type { TodoistApi } from '@doist/todoist-sdk';

/**
 * Move a recurring task to its next occurrence using the same behavior as official Todoist clients
 * when you complete/close a recurring task: `POST /api/v1/tasks/{id}/close`. Recurrence is preserved;
 * only the current instance rolls forward.
 *
 * @see https://developer.todoist.com/api/v1/#tag/Tasks/operation/close_task_api_v1_tasks__task_id__close_post
 */
export async function advanceToNextOccurrence(api: TodoistApi, taskId: string): Promise<void> {
  const ok = await api.closeTask(taskId);
  if (!ok) {
    throw new Error(`closeTask did not succeed for task ${taskId}`);
  }
}
