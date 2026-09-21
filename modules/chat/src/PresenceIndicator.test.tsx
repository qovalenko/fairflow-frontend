import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PresenceIndicator from './PresenceIndicator'

describe('PresenceIndicator', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('online: подпись «В сети»', () => {
        render(<PresenceIndicator state="online" />)
        expect(screen.getByText('В сети')).toBeInTheDocument()
    })

    it('offline без lastSeen: «Не в сети»', () => {
        render(<PresenceIndicator state="offline" />)
        expect(screen.getByText('Не в сети')).toBeInTheDocument()
    })

    it('offline с lastSeen: человекочитаемый интервал', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
        render(<PresenceIndicator state="offline" lastSeenAt={Date.now() - 5 * 60_000} />)
        expect(screen.getByText('был в сети 5 мин. назад')).toBeInTheDocument()
    })
})
