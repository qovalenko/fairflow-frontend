import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { PiCaretLeftDuotone } from 'react-icons/pi'
import { qa } from '@/shared/qa'
import Button from '@/components/ui/Button'
import type { CommonProps } from '@/@types/common'

const ANIM_MS = 340

type BackParams = { pathname?: string }

const BACK_ROUTES: Array<{ pattern: RegExp; backPath: (params: BackParams) => string }> = [
    { pattern: /^\/companies\/[^/]+/, backPath: () => '/companies' },
    { pattern: /^\/contacts\/[^/]+/, backPath: () => '/contacts' },
    { pattern: /^\/deals\/[^/]+/, backPath: () => '/deals' },
    { pattern: /^\/orders\/[^/]+/, backPath: () => '/orders' },
    { pattern: /^\/activities\/[^/]+/, backPath: () => '/activities' },
    { pattern: /^\/products\/[^/]+/, backPath: () => '/products' },
    { pattern: /^\/documents\/[^/]+/, backPath: () => '/documents' },
    { pattern: /^\/automation\/[^/]+/, backPath: () => '/automation' },
    { pattern: /^\/deals\/pipelines\/[^/]+/, backPath: () => '/deals/pipelines' },
    { pattern: /^\/orders\/types\/[^/]+/, backPath: () => '/orders/types' },
    { pattern: /^\/p\/([^/]+)\/companies\/[^/]+/, backPath: () => '/companies' },
    { pattern: /^\/p\/([^/]+)\/contacts\/[^/]+/, backPath: () => '/contacts' },
    { pattern: /^\/p\/([^/]+)\/deals\/[^/]+/, backPath: () => '/deals' },
    { pattern: /^\/p\/([^/]+)\/orders\/[^/]+/, backPath: () => '/orders' },
    { pattern: /^\/p\/([^/]+)\/activities\/[^/]+/, backPath: () => '/activities' },
    { pattern: /^\/p\/([^/]+)\/products\/[^/]+/, backPath: () => '/products' },
    { pattern: /^\/p\/([^/]+)\/documents\/[^/]+/, backPath: () => '/documents' },
    { pattern: /^\/p\/([^/]+)\/automation\/[^/]+/, backPath: () => '/automation' },
    { pattern: /^\/p\/([^/]+)\/deals\/pipelines\/[^/]+/, backPath: () => '/deals/pipelines' },
    { pattern: /^\/p\/([^/]+)\/orders\/types\/[^/]+/, backPath: () => '/orders/types' },
    { pattern: /^\/settings\/employees\/[^/]+/, backPath: () => '/settings/employees' },
    { pattern: /^\/settings\/departments\/[^/]+(?:\/edit)?/, backPath: () => '/settings/departments' },
    { pattern: /^\/settings\/.+/, backPath: () => '/settings' },
]

const WIDE = '2.5rem'
const ZERO = '0px'
const TRANSITION = `width ${ANIM_MS}ms ease-in-out, min-width ${ANIM_MS}ms ease-in-out`

const HeaderBackButton = ({ className, ...rest }: CommonProps) => {
    const location = useLocation()
    const navigate = useNavigate()

    const match = BACK_ROUTES.find(({ pattern }) => pattern.test(location.pathname))
    const backPath = match ? match.backPath({ pathname: location.pathname }) : null

    const slotRef = useRef<HTMLDivElement>(null)
    const prevVisibleRef = useRef(!!backPath)
    const prevPathnameRef = useRef(location.pathname)
    const lastPathRef = useRef<string | null>(backPath)
    const mountedRef = useRef(false)
    const [btnAnim, setBtnAnim] = useState('')

    if (backPath) lastPathRef.current = backPath

    useLayoutEffect(() => {
        const el = slotRef.current
        if (!el) return

        if (!mountedRef.current) {
            mountedRef.current = true
            el.style.width = backPath ? WIDE : ZERO
            el.style.minWidth = backPath ? WIDE : ZERO
            return
        }

        const pathnameChanged = prevPathnameRef.current !== location.pathname
        prevPathnameRef.current = location.pathname

        const wasVisible = prevVisibleRef.current
        const isVisible = !!backPath
        prevVisibleRef.current = isVisible

        if (!pathnameChanged) {
            el.style.transition = 'none'
            el.style.width = isVisible ? WIDE : ZERO
            el.style.minWidth = isVisible ? WIDE : ZERO
            setBtnAnim('')
            return
        }

        if (wasVisible === isVisible) return

        if (isVisible) {
            el.style.transition = 'none'
            el.style.width = ZERO
            el.style.minWidth = ZERO
            el.getBoundingClientRect()
            el.style.transition = TRANSITION
            el.style.width = WIDE
            el.style.minWidth = WIDE
            setBtnAnim('animate-header-back-in')
        } else {
            setBtnAnim('animate-header-back-out')
            el.style.transition = TRANSITION
            el.style.width = ZERO
            el.style.minWidth = ZERO
            const timer = setTimeout(() => {
                lastPathRef.current = null
                setBtnAnim('')
                el.style.transition = 'none'
            }, ANIM_MS)
            return () => clearTimeout(timer)
        }
    }, [backPath, location.pathname])

    const pathToUse = backPath ?? lastPathRef.current

    return (
        <div
            ref={slotRef}
            className="flex items-center justify-center overflow-hidden flex-shrink-0"
        >
            {pathToUse && (
                <Button
                    variant="plain"
                    shape="circle"
                    size="sm"
                    icon={<PiCaretLeftDuotone className="w-5 h-5" />}
                    className={`${btnAnim} header-action-item-hoverable ${className ?? ''}`}
                    aria-label="Назад к списку"
                    tabIndex={backPath ? 0 : -1}
                    onClick={() => navigate(pathToUse)}
                    {...qa('host.header.back')}
                    {...rest}
                />
            )}
        </div>
    )
}

export default HeaderBackButton
