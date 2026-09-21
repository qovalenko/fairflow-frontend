/** Vitest stub for host Dialog dependency (react-modal not in deals node_modules). */
import type { ReactNode } from 'react'

type ModalProps = {
    isOpen?: boolean
    children?: ReactNode
    onRequestClose?: () => void
    onClose?: () => void
    className?: string
    overlayClassName?: string
    style?: Record<string, unknown>
    contentLabel?: string
}

export default function Modal({
    isOpen,
    children,
    onRequestClose,
    onClose,
    ...rest
}: ModalProps) {
    if (!isOpen) return null
    return (
        <div role="dialog" {...rest}>
            {children}
            <button type="button" onClick={() => (onRequestClose ?? onClose)?.()}>
                close-stub
            </button>
        </div>
    )
}
