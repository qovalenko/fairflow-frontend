import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import HostSlot from './HostSlot'
import { registerHostSlot, getHostSlot, resetHostSlot } from './hostSlotBridge'
import type { HostSlotProps } from './hostSlotBridge'

/**
 * TODO-450 — «домен умеет, а до пользователя не доходит».
 *
 * The activities manifest declares five mount-points; four of them target the
 * entity-card slots (`contact|company|deal|order.card.tab`). Those cards are
 * rendered from federated REMOTES, which cannot import the host `<Slot>` (it
 * pulls Module-Federation virtual ids into a bundle that declares no remotes),
 * so they mount `<HostSlot>` instead. Two things must hold for the contribution
 * to reach the user, and both are asserted here:
 *  1. `<HostSlot>` really delegates to the renderer the host publishes, and
 *     degrades to the card's built-in widget when there is no host (standalone);
 *  2. the four card screens actually contain that mount point — a slot declared
 *     in the catalog but rendered nowhere is exactly the dead contribution this
 *     ticket was about.
 */

afterEach(() => {
    cleanup()
    resetHostSlot()
})

describe('HostSlot — bridge to the host slot renderer', () => {
    it('renders the fallback when no host renderer is registered (standalone module)', () => {
        expect(getHostSlot()).toBeNull()

        render(
            <HostSlot
                id="contact.card.tab"
                context={{ contactId: 'c-1' }}
                fallback={<div>built-in widget</div>}
            />,
        )

        expect(screen.getByText('built-in widget')).toBeInTheDocument()
    })

    it('renders nothing when there is neither a host renderer nor a fallback', () => {
        const { container } = render(<HostSlot id="deal.card.tab" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('delegates to the registered renderer and forwards every prop', () => {
        const seen: HostSlotProps[] = []
        registerHostSlot((props: HostSlotProps) => {
            seen.push(props)
            return <div>slot contribution</div>
        })

        render(
            <HostSlot
                id="company.card.tab"
                context={{ companyId: 'co-7' }}
                className="flex flex-col"
                fallback={<div>built-in widget</div>}
            />,
        )

        // The host renderer wins over the built-in widget — no duplicate section.
        expect(screen.getByText('slot contribution')).toBeInTheDocument()
        expect(screen.queryByText('built-in widget')).not.toBeInTheDocument()
        expect(seen).toHaveLength(1)
        expect(seen[0].id).toBe('company.card.tab')
        expect(seen[0].context).toEqual({ companyId: 'co-7' })
        expect(seen[0].className).toBe('flex flex-col')
        // `fallback` is forwarded too: the host `<Slot>` renders it itself when
        // the slot ends up with no visible contribution.
        expect(seen[0].fallback).toBeDefined()
    })
})

describe('entity cards mount their `*.card.tab` slot', () => {
    const frontendRoot = path.resolve(__dirname, '../../../..')

    const cards: Array<{ slot: string; contextProp: string; file: string }> = [
        {
            slot: 'contact.card.tab',
            contextProp: 'contactId',
            file: 'modules/contacts/src/ContactDetails.tsx',
        },
        {
            slot: 'company.card.tab',
            contextProp: 'companyId',
            file: 'modules/companies/src/views/crm/Companies/CompanyDetails.tsx',
        },
        {
            slot: 'deal.card.tab',
            contextProp: 'dealId',
            file: 'modules/deals/src/Deals/DealDetails.tsx',
        },
        {
            slot: 'order.card.tab',
            contextProp: 'orderId',
            file: 'modules/orders/src/OrderDetails.tsx',
        },
    ]

    it.each(cards)(
        '$file mounts <HostSlot id="$slot"> with $contextProp',
        ({ slot, contextProp, file }) => {
            const source = readFileSync(path.join(frontendRoot, file), 'utf8')

            expect(source).toContain(`id="${slot}"`)
            expect(source).toMatch(
                new RegExp(`id="${escapeRe(slot)}"[\\s\\S]{0,200}${contextProp}:`),
            )
            // The card must go through the remote-safe facade, never through the
            // host `<Slot>` (federation ids would break the remote build).
            expect(source).toContain(
                "import HostSlot from '@/components/shared/HostSlot'",
            )
            expect(source).not.toMatch(
                /import Slot from '@\/components\/shared\/Slot'/,
            )
        },
    )
})

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
