import { describe, expect, it } from 'vitest';
import type { Task } from '@doist/todoist-sdk';
import { isEligibleTask } from './eligibility.js';

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    userId: 'u',
    projectId: 'p',
    sectionId: null,
    parentId: null,
    addedByUid: null,
    assignedByUid: null,
    responsibleUid: null,
    labels: [],
    deadline: null,
    duration: null,
    checked: false,
    isDeleted: false,
    addedAt: null,
    completedAt: null,
    updatedAt: null,
    due: null,
    priority: 1,
    childOrder: 1,
    content: 'x',
    description: '',
    dayOrder: 1,
    isCollapsed: false,
    isUncompletable: false,
    url: 'https://todoist.com/showTask?id=1',
    ...overrides,
  };
}

describe('isEligibleTask', () => {
  it('accepts recurring timed active tasks', () => {
    const task = baseTask({
      due: {
        isRecurring: true,
        string: 'every day',
        date: '2026-04-18',
        datetime: '2026-04-18T17:00:00.000000Z',
        timezone: 'America/Los_Angeles',
        lang: 'en',
      },
    });
    expect(isEligibleTask(task)).toBe(true);
  });

  it('accepts date-only recurring tasks for daily+ coarser cadence', () => {
    const task = baseTask({
      due: {
        isRecurring: true,
        string: 'every day',
        date: '2026-04-18',
        datetime: null,
        timezone: null,
        lang: 'en',
      },
    });
    expect(isEligibleTask(task)).toBe(true);
  });

  it('rejects date-only tasks that look hourly', () => {
    const task = baseTask({
      due: {
        isRecurring: true,
        string: 'every hour',
        date: '2026-04-18',
        datetime: null,
        timezone: null,
        lang: 'en',
      },
    });
    expect(isEligibleTask(task)).toBe(false);
  });

  it('rejects completed tasks', () => {
    const task = baseTask({
      checked: true,
      due: {
        isRecurring: true,
        string: 'every day',
        date: '2026-04-18',
        datetime: '2026-04-18T17:00:00.000000Z',
        timezone: 'UTC',
        lang: 'en',
      },
    });
    expect(isEligibleTask(task)).toBe(false);
  });
});
