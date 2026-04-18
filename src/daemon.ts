import type { TodoistApi } from '@doist/todoist-sdk';
import { DateTime } from 'luxon';
import { advanceToNextOccurrence } from './advancer.js';
import type { AppConfig } from './config.js';
import { dueFingerprint, isSameDueSnapshot, parseCurrentOccurrence } from './due-datetime.js';
import { isEligibleTask } from './eligibility.js';
import { shouldAdvance } from './evaluator.js';
import type { Logger } from './logger.js';
import { buildRRuleFromDueString } from './recurrence-parser.js';
import { StateGuard } from './state-guard.js';
import { fetchAllActiveTasks } from './todoist-tasks.js';

export function startDaemon(
  api: TodoistApi,
  cfg: AppConfig,
  userDefaultZone: string,
  log: Logger,
): { stop: () => void } {
  const fallbackZone = cfg.DEFAULT_TIMEZONE ?? userDefaultZone;
  const guard = new StateGuard(cfg.STATE_GUARD_TTL_MS);
  let runningTick = false;
  let stopped = false;

  const tick = async () => {
    if (stopped || runningTick) return;
    runningTick = true;
    try {
      const tasks = await fetchAllActiveTasks(api);
      log.debug(`Fetched ${tasks.length} active task(s)`);

      for (const task of tasks) {
        if (!isEligibleTask(task)) continue;
        const due = task.due;
        if (!due) continue;

        const current = parseCurrentOccurrence(due, fallbackZone);
        if (!current) {
          log.warn('Could not parse current occurrence; skipping', task.id, due);
          continue;
        }

        const now = DateTime.now().setZone(current.zone);
        if (current >= now) continue;

        const rule = buildRRuleFromDueString(due.string, current);
        if (!rule) {
          log.debug('Could not build recurrence rule; skipping', task.id, due.string);
          continue;
        }

        const nextJs = rule.after(current.toJSDate(), false);
        if (!nextJs) {
          log.debug('No next occurrence from rule; skipping', task.id);
          continue;
        }

        const next = DateTime.fromJSDate(nextJs, { zone: current.zone });
        if (!shouldAdvance(now, current, next, cfg.ADVANCE_WINDOW_MS)) continue;

        const fresh = await api.getTask(task.id);
        if (!isEligibleTask(fresh)) continue;
        if (!isSameDueSnapshot(fresh.due, due)) continue;

        const guardKey = `${task.id}:${dueFingerprint(due)}`;
        if (!guard.reserve(guardKey)) {
          log.debug('Duplicate advance suppressed', guardKey);
          continue;
        }

        try {
          log.info('Advancing recurring task', {
            taskId: task.id,
            content: task.content,
            from: current.toISO(),
            to: next.toISO(),
          });
          await advanceToNextOccurrence(api, task.id);
        } catch (err) {
          guard.release(guardKey);
          log.error('Failed to advance task', task.id, err);
        }
      }
    } catch (err) {
      log.error('Tick failed', err);
    } finally {
      runningTick = false;
    }
  };

  void tick();
  const id = setInterval(() => {
    void tick();
  }, cfg.POLL_INTERVAL_MS);

  const stop = () => {
    stopped = true;
    clearInterval(id);
  };

  return { stop };
}
