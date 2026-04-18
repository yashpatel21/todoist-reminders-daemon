import type { Task, TodoistApi } from '@doist/todoist-sdk';

/**
 * Paginate through every active task returned by GET /tasks (see Todoist REST v1 docs).
 */
export async function fetchAllActiveTasks(api: TodoistApi): Promise<Task[]> {
  const results: Task[] = [];
  let cursor: string | null = null;

  do {
    const page = await api.getTasks({
      cursor,
      limit: 200,
    });
    results.push(...page.results);
    cursor = page.nextCursor;
  } while (cursor);

  return results;
}
