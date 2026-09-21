/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import useDrawerEntities from './useDrawerEntities'

vi.mock('@/utils/hooks/usePlatformModules', () => ({
    default: () => ({
        ready: true,
        enabledCards: [
            {
                id: 'contacts',
                drawerEntities: ['contact'],
            },
            {
                id: 'activities',
                drawerEntities: ['task', 'call'],
            },
        ],
    }),
}))

describe('useDrawerEntities (FR-SHELL-270)', () => {
    it('builds quick-create items from manifest drawerEntities', () => {
        const { result } = renderHook(() => useDrawerEntities())
        expect(result.current.map((i) => i.key)).toEqual(['contact', 'task', 'call'])
        expect(result.current[0]).toMatchObject({
            moduleKey: 'contacts',
            entityType: 'contact',
            label: 'Контакт',
        })
    })
})
