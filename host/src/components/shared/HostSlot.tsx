import { getHostSlot } from './hostSlotBridge'
import type { HostSlotProps } from './hostSlotBridge'

/**
 * Remote-safe facade over the host `<Slot>` (see `hostSlotBridge.ts`).
 *
 * Use it in views that are rendered from a FEDERATED remote bundle — the entity
 * card screens (`SCR-CONTACTS-DETAILS`, `SCR-COMPANIES-DETAILS`,
 * `SCR-DEALS-DETAILS`, `SCR-ORDERS-DETAILS`), which own the
 * `contact|company|deal|order.card.tab` mount-points but live in the
 * `contacts` / `companies` / `deals` / `orders` remotes. Host-owned views
 * (dashboard, project settings) import `<Slot>` directly.
 *
 *   <HostSlot
 *       id="contact.card.tab"
 *       context={{ contactId: contact.id }}
 *       fallback={<ContactActivitiesWidget … />}
 *   />
 *
 * Outside the host shell (standalone module dev/build) nothing is registered and
 * the `fallback` is rendered, so a card keeps working with its built-in widget.
 */
const HostSlot = (props: HostSlotProps) => {
    const Slot = getHostSlot()
    if (!Slot) return <>{props.fallback ?? null}</>
    return <Slot {...props} />
}

export default HostSlot
