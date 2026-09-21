import { describe, it, expect, vi } from 'vitest'
import { pushToast } from './notify'

const toastPush = vi.fn()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

describe('pushToast', () => {
    it('передаёт Notification-элемент в toast.push', () => {
        pushToast('Граф валиден.', 'success')
        expect(toastPush).toHaveBeenCalledTimes(1)
        const [node, opts] = toastPush.mock.calls[0]
        expect(opts).toEqual({ placement: 'top-center' })
        expect(node.props.type).toBe('success')
        expect(node.props.children).toBe('Граф валиден.')
    })
})
