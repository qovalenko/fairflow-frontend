import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  completeOnboardingWizard,
  readOnboardingMetrics,
  startOnboardingWizard,
} from './onboardingMetrics'

describe('onboardingMetrics (NFR-PSET-010)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records duration when wizard completes after start', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(61_000)

    startOnboardingWizard()
    const entry = completeOnboardingWizard('p-1')

    expect(entry).toEqual({
      projectId: 'p-1',
      durationMs: 60_000,
      completedAt: expect.any(String),
    })
    expect(readOnboardingMetrics()).toHaveLength(1)
    expect(console.info).toHaveBeenCalledWith('[onboarding-metrics]', entry)
  })

  it('returns null when complete is called without start', () => {
    expect(completeOnboardingWizard('p-2')).toBeNull()
    expect(readOnboardingMetrics()).toHaveLength(0)
  })
})
