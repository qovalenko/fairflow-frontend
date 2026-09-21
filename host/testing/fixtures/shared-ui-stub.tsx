import type { ReactNode } from 'react'

export const Container = ({ children }: { children?: ReactNode }) => (
    <div data-testid="shared-ui-container">{children}</div>
)

export const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>
