import { LayoutType } from './theme'
import type { ComponentType, LazyExoticComponent, ReactNode, JSX } from 'react'

export type PageHeaderProps = {
    title?: string | ReactNode | LazyExoticComponent<() => JSX.Element>
    description?: string | ReactNode
    contained?: boolean
    extraHeader?: string | ReactNode | LazyExoticComponent<() => JSX.Element>
}

export interface Meta {
    pageContainerType?: 'default' | 'gutterless' | 'contained'
    pageBackgroundType?: 'default' | 'plain'
    header?: PageHeaderProps
    footer?: boolean
    layout?: LayoutType
    defaultTab?: string
    /** Document title for browser tab */
    pageTitle?: string
    /** PDP gate `subject:action` for route entry (R3-E1-10 / TODO-294; defense-in-depth). */
    requires?: string
}

export type Route = {
    key: string
    path: string
    component: LazyExoticComponent<ComponentType<Record<string, unknown>>>
    authority: string[]
    meta?: Meta
}

export type Routes = Route[]
