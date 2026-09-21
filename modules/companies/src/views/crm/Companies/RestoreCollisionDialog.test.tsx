import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestoreCollisionDialog, {
    parseRestoreCollision,
    ALL_RESTORE_STRATEGIES,
    type RestoreCollision,
    type RestoreStrategy,
} from './RestoreCollisionDialog'

describe('parseRestoreCollision', () => {
    it('возвращает null для обычной ошибки', () => {
        expect(parseRestoreCollision(new Error('network'))).toBeNull()
        expect(parseRestoreCollision({ response: { data: { error: { code: 'NOT_FOUND' } } } })).toBeNull()
    })

    it('распознаёт FAILED_PRECONDITION и фильтрует стратегии из details', () => {
        const collision = parseRestoreCollision({
            response: {
                data: {
                    error: {
                        code: 'FAILED_PRECONDITION',
                        message: 'Ключ занят',
                        details: { options: ['merge', 'bogus', 'clear_key'], conflictId: 'x1' },
                    },
                },
            },
        })
        expect(collision).toEqual({
            options: ['merge', 'clear_key'],
            message: 'Ключ занят',
            conflictId: 'x1',
        })
    })

    it('подставляет полный набор стратегий, если details.options потерялись', () => {
        const collision = parseRestoreCollision({
            response: { data: { error: { code: 'FAILED_PRECONDITION' } } },
        })
        expect(collision?.options).toEqual(ALL_RESTORE_STRATEGIES)
    })
})

describe('RestoreCollisionDialog', () => {
    afterEach(async () => {
        cleanup()
        // Dialog/react-modal снимает портал по closeTimeoutMS=150 после unmount;
        // без паузы vitest ловит `document is not defined` после teardown jsdom.
        await new Promise((r) => setTimeout(r, 160))
    })

    const collision: RestoreCollision = {
        options: ['merge', 'clear_key'] as RestoreStrategy[],
        message: 'Активный дубль держит ИНН',
    }

    it('не рендерит содержимое, пока диалог закрыт', () => {
        render(
            <RestoreCollisionDialog
                isOpen={false}
                collision={collision}
                value="merge"
                onChange={vi.fn()}
                onConfirm={vi.fn()}
                onClose={vi.fn()}
            />,
        )
        expect(screen.queryByText('Есть активный дубль')).not.toBeInTheDocument()
    })

    it('показывает стратегии, переключает выбор и подтверждает', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        const onConfirm = vi.fn()
        render(
            <RestoreCollisionDialog
                isOpen
                companyName="ООО Альфа"
                collision={collision}
                value="merge"
                onChange={onChange}
                onConfirm={onConfirm}
                onClose={vi.fn()}
            />,
        )

        expect(screen.getByText('Есть активный дубль')).toBeInTheDocument()
        expect(screen.getByText(/ООО Альфа/)).toBeInTheDocument()
        expect(screen.getByText('Объединить с активной компанией')).toBeInTheDocument()

        await user.click(screen.getByText('Снять ключ дедупликации'))
        expect(onChange).toHaveBeenCalledWith('clear_key')

        await user.click(screen.getByRole('button', { name: 'Восстановить' }))
        expect(onConfirm).toHaveBeenCalled()
    })

    it('блокирует подтверждение без выбранной стратегии', () => {
        render(
            <RestoreCollisionDialog
                isOpen
                collision={collision}
                value={null}
                onChange={vi.fn()}
                onConfirm={vi.fn()}
                onClose={vi.fn()}
            />,
        )
        expect(screen.getByRole('button', { name: 'Восстановить' })).toHaveClass('cursor-not-allowed')
    })
})
