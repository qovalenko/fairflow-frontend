import type { ProjectModuleConfig } from '@/@types/auth'

const REMINDER_OFFSETS = ['none', 'at_time', '15m', '1h', '1d'] as const
export type ActivityReminderOffset = (typeof REMINDER_OFFSETS)[number]

/** FR-ACTIVITIES-010: default reminder from activities module personalSettings. */
export function activitiesDefaultReminder(
    moduleConfigs?: ProjectModuleConfig[],
): ActivityReminderOffset {
    const cfg = moduleConfigs?.find((m) => m.moduleId === 'activities')
    const raw = cfg?.personalSettings?.defaultReminder
    if (typeof raw === 'string' && (REMINDER_OFFSETS as readonly string[]).includes(raw)) {
        return raw as ActivityReminderOffset
    }
    return 'none'
}
