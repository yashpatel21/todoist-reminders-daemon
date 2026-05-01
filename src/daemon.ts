import type { TodoistApi } from '@doist/todoist-sdk'
import { DateTime } from 'luxon'
import { analyzeAdvanceDecision } from './advance-target.js'
import { advanceTaskDue } from './advancer.js'
import type { AppConfig } from './config.js'
import { dueHasTime, isSameDueSnapshot, parseCurrentOccurrence } from './due-datetime.js'
import { isEligibleTask } from './eligibility.js'
import type { Logger } from './logger.js'
import { buildRRuleFromDueString } from './recurrence-parser.js'
import { fetchAllActiveTasks } from './todoist-tasks.js'

export function startDaemon(
	api: TodoistApi,
	cfg: AppConfig,
	userDefaultZone: string,
	log: Logger,
): { stop: () => void } {
	const scheduleDiag =
		process.env.SCHEDULE_DIAG === '1' || process.env.SCHEDULE_DIAG?.toLowerCase() === 'true'
	const fallbackZone = cfg.DEFAULT_TIMEZONE ?? userDefaultZone
	let runningTick = false
	let stopped = false

	const tick = async () => {
		if (stopped) return
		if (runningTick) {
			log.warn(
				'Poll tick skipped: previous tick still running (Todoist request hung or still in flight). Check container DNS / outbound HTTPS to api.todoist.com.',
			)
			return
		}
		runningTick = true
		try {
			log.info('Poll tick: fetching active tasks from Todoist')
			const tasks = await fetchAllActiveTasks(api)
			log.info('Polled Todoist', { activeTasks: tasks.length })

			for (const task of tasks) {
				if (!isEligibleTask(task)) continue
				const due = task.due
				if (!due) continue

				const current = parseCurrentOccurrence(due, fallbackZone)
				if (!current) {
					log.warn('Could not parse current occurrence; skipping', task.id, due)
					continue
				}

				const allDayRecurring = !dueHasTime(due)
				const now = DateTime.now().setZone(current.zone)
				if (!allDayRecurring && current >= now) continue

				const rule = buildRRuleFromDueString(due.string, current)
				if (!rule) {
					log.warn('Could not build recurrence rule; skipping overdue recurring task', {
						taskId: task.id,
						content: task.content,
						dueString: due.string,
					})
					continue
				}

				const analysis = analyzeAdvanceDecision(current, now, rule, cfg.ADVANCE_WINDOW_MS, {
					allDay: allDayRecurring,
				})
				if (scheduleDiag && (allDayRecurring || current < now)) {
					log.info('Recurring occurrence check', {
						taskId: task.id,
						content: task.content,
						allDay: allDayRecurring,
						decision: analysis.kind,
						current: current.toISO(),
						now: now.toISO(),
						containerUnixMs: Date.now(),
						...(analysis.kind === 'before_grace_window'
							? {
									nextOccurrence: analysis.next.toISO(),
									windowOpens: analysis.graceStart.toISO(),
									advanceWindowMs: cfg.ADVANCE_WINDOW_MS,
								}
							: {}),
					})
				}
				if (analysis.kind === 'stuck_duplicate_next') {
					log.warn('Recurrence advance stuck (duplicate rule.next)', {
						taskId: task.id,
						content: task.content,
						dueString: due.string,
					})
					continue
				}

				const target = analysis.kind === 'advance' ? analysis.target : null
				if (!target) continue

				const fresh = await api.getTask(task.id)
				if (!isEligibleTask(fresh)) continue
				if (!isSameDueSnapshot(fresh.due, due)) {
					log.info('Skipping candidate advance because due changed during refresh', {
						taskId: task.id,
						listDue: due,
						freshDue: fresh.due,
					})
					continue
				}

				try {
					log.info('Advancing recurring task', {
						taskId: task.id,
						content: task.content,
						from: current.toISO(),
						to: target.toISO(),
					})
					await advanceTaskDue(api, task.id, due, target, { allDay: allDayRecurring })
				} catch (err) {
					log.error('Failed to advance task', task.id, err)
				}
			}
		} catch (err) {
			log.error('Tick failed', err)
		} finally {
			runningTick = false
		}
	}

	log.info('Poll scheduler started', { intervalMs: cfg.POLL_INTERVAL_MS })
	void tick()
	const id = setInterval(() => {
		void tick()
	}, cfg.POLL_INTERVAL_MS)

	const stop = () => {
		stopped = true
		clearInterval(id)
	}

	return { stop }
}
