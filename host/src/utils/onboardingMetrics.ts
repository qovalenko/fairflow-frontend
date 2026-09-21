const STORAGE_KEY = 'ff.onboarding.metrics'
const SESSION_START_KEY = 'ff.onboarding.startedAt'

export type OnboardingMetricEntry = {
  projectId: string
  durationMs: number
  completedAt: string
}

/** NFR-PSET-010: mark wizard open for median-duration measurement. */
export function startOnboardingWizard(): void {
  try {
    sessionStorage.setItem(SESSION_START_KEY, String(Date.now()))
  } catch {
    // ignore quota / private mode
  }
}

function readRing(): OnboardingMetricEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as OnboardingMetricEntry[]) : []
  } catch {
    return []
  }
}

function writeRing(entries: OnboardingMetricEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-50)))
  } catch {
    // ignore
  }
}

/** NFR-PSET-010: record completion duration (local ring buffer + structured log). */
export function completeOnboardingWizard(projectId: string): OnboardingMetricEntry | null {
  let startedAt: string | null = null
  try {
    startedAt = sessionStorage.getItem(SESSION_START_KEY)
    sessionStorage.removeItem(SESSION_START_KEY)
  } catch {
    startedAt = null
  }
  if (!startedAt) return null
  const durationMs = Math.max(0, Date.now() - Number(startedAt))
  const entry: OnboardingMetricEntry = {
    projectId,
    durationMs,
    completedAt: new Date().toISOString(),
  }
  writeRing([...readRing(), entry])
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[onboarding-metrics]', entry)
  }
  return entry
}

export function readOnboardingMetrics(): OnboardingMetricEntry[] {
  return readRing()
}
