import type { ComponentType, ReactNode } from 'react'
import type { MountSlotId } from '@/configs/slot-catalog.config'

/**
 * Host-slot bridge (R4-E1-09 / FR-SHELL-7a, RFC-3 §1.4).
 *
 * PROBLEM. `<Slot>` is the host's slot renderer, and it can only live in the
 * host bundle: `loadRemoteComponent` spells out Module-Federation virtual ids
 * (`import('remoteActivities/ActivityCardTab')`) that ONLY the host build
 * declares as remotes. But four of the slots in `SLOT_CATALOG` —
 * `contact|company|deal|order.card.tab` — belong to entity CARD screens, and
 * those screens are not host views: they are rendered inside the `contacts` /
 * `companies` / `deals` / `orders` remotes. A card view that imported `<Slot>`
 * directly would inline `loadRemoteComponent` into its OWN bundle, where
 * `remoteActivities/...` resolves to nothing (and in standalone mode there is no
 * federation runtime at all).
 *
 * SOLUTION. The host publishes its `<Slot>` implementation into a process-wide
 * registry at app bootstrap (`App.tsx`), and remote-rendered views mount
 * `<HostSlot>` — a dependency-free facade that looks the implementation up at
 * render time. Consequences:
 *  - the remote bundle stays federation-free (this file and `HostSlot.tsx`
 *    import nothing but React types and a type-only slot id);
 *  - inside the host shell the contribution is rendered by the HOST's `<Slot>`,
 *    so contribution collection, Contextual-UI gating, `PermissionCheck` and the
 *    error boundary all stay in exactly one place;
 *  - in standalone mode (`VITE_STANDALONE_MODE`) nothing is registered, so
 *    `<HostSlot>` renders its `fallback` — the module's own built-in widget.
 *
 * A global (rather than a React context) is what actually works across the MF
 * boundary: the host and a remote each inline their own copy of this file, so a
 * context object created here would have two different identities; `globalThis`
 * is the one thing both copies genuinely share.
 */

/** Props of the host `<Slot>` — mirrored here so remotes need no Slot import. */
export interface HostSlotProps {
    /** Slot id from the host SLOT_CATALOG (RFC-3). */
    id: MountSlotId
    /** Context props passed verbatim to each contribution (RFC-3 §1.2). */
    context?: Record<string, unknown>
    /** Wrapper class for the slot container. */
    className?: string
    /** Rendered when the slot has no (visible) contributions. */
    fallback?: ReactNode
    /** Render ONLY the contribution with this `SlotContribution.key`. */
    only?: string
}

export type HostSlotComponent = ComponentType<HostSlotProps>

interface HostSlotGlobal {
    __FF_HOST_SLOT__?: HostSlotComponent
}

const registry = globalThis as HostSlotGlobal

/**
 * Publish the host's slot renderer. Called once from the host bootstrap, at
 * module scope — i.e. BEFORE the first React render, so a plain read in
 * `<HostSlot>` never races the registration.
 */
export function registerHostSlot(component: HostSlotComponent): void {
    registry.__FF_HOST_SLOT__ = component
}

/** The registered renderer, or `null` when running outside the host shell. */
export function getHostSlot(): HostSlotComponent | null {
    return registry.__FF_HOST_SLOT__ ?? null
}

/** Test helper — drop the registration (there is no "unmount" in production). */
export function resetHostSlot(): void {
    delete registry.__FF_HOST_SLOT__
}
