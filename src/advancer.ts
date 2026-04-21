import type { TodoistApi } from '@doist/todoist-sdk';
import type { Task } from '@doist/todoist-sdk';
import { DateTime } from 'luxon';

/**
 * Sets the recurring task's current instance to `target` while keeping the same
 * recurrence phrase. Uses the REST update endpoint so the due matches our computed
 * instant (closeTask would follow Todoist's own roll-forward rules, which can skip
 * occurrences relative to wall clock).
 *
 * @see https://developer.todoist.com/api/v1/#tag/Tasks/operation/update_task_api_v1_tasks__task_id__post
 */
export async function advanceTaskDue(
  api: TodoistApi,
  taskId: string,
  due: NonNullable<Task['due']>,
  target: DateTime,
): Promise<void> {
  const dueDatetime = target.toUTC().toISO();
  if (!dueDatetime) {
    throw new Error(`Invalid target datetime for task ${taskId}`);
  }

  await api.updateTask(taskId, {
    dueDatetime,
    dueString: due.string,
    ...(due.lang != null && due.lang !== '' ? { dueLang: due.lang } : {}),
  });
}
