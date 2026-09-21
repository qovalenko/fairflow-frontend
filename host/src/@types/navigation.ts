export type HorizontalMenuMeta =
    | {
          layout: 'default'
      }
    | {
          layout: 'columns'
          showColumnTitle?: boolean
          columns: 1 | 2 | 3 | 4 | 5
      }
    | {
          layout: 'tabs'
          columns: 1 | 2 | 3 | 4 | 5
      }

export interface NavigationTree {
    key: string
    path: string
    isExternalLink?: boolean
    title: string
    translateKey: string
    icon: string
    type: 'title' | 'collapse' | 'item'
    authority: string[]
    subMenu: NavigationTree[]
    /** If set, this item is shown only when enabledModules includes this key. Omit for core (e.g. dashboard, statistics). */
    moduleKey?: string
    /** Optional badge count (e.g. overdue activities). */
    badge?: number
    /** If true, this item is disabled when no project is selected. */
    requiresProject?: boolean
    /** Permission gate `subject:action` (R3-E1-10 / usePermission); empty = ungated. */
    requires?: string
    description?: string
    meta?: {
        horizontalMenu?: HorizontalMenuMeta
        description?: {
            translateKey: string
            label: string
        }
    }
}
