import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore, getEnabledModules } from './projectStore'
import type { Project } from './projectStore'

const ID_KEY = 'fairflow_current_project_id'
const PROJECT_KEY = 'fairflow_current_project'

const project = (id: string, over: Partial<Project> = {}): Project => ({
    id,
    name: `Project ${id}`,
    enabledModules: ['contacts', 'deals'],
    ...over,
})

describe('projectStore — project context persistence (T-001)', () => {
    beforeEach(() => {
        // setup.ts clears storage; also reset the in-memory store.
        useProjectStore.setState({ currentProject: null, currentProjectId: null })
        localStorage.clear()
    })

    it('setCurrentProject persists id + project snapshot to localStorage', () => {
        useProjectStore.getState().setCurrentProject(project('p1'))

        const state = useProjectStore.getState()
        expect(state.currentProjectId).toBe('p1')
        expect(state.currentProject?.id).toBe('p1')
        expect(localStorage.getItem(ID_KEY)).toBe('p1')
        expect(JSON.parse(localStorage.getItem(PROJECT_KEY)!).id).toBe('p1')
    })

    it('setCurrentProject(null) clears state AND both localStorage keys', () => {
        // Seed a stored selection first.
        useProjectStore.getState().setCurrentProject(project('p1'))
        expect(localStorage.getItem(ID_KEY)).toBe('p1')

        // T-001: logout / stale-project reconciliation nulls the context. If this
        // did not remove the localStorage keys, the stale id would survive the
        // session swap and the next user would send X-Project-Id of someone else
        // → 403 on project-scoped calls.
        useProjectStore.getState().setCurrentProject(null)

        const state = useProjectStore.getState()
        expect(state.currentProject).toBeNull()
        expect(state.currentProjectId).toBeNull()
        expect(localStorage.getItem(ID_KEY)).toBeNull()
        expect(localStorage.getItem(PROJECT_KEY)).toBeNull()
    })
})

describe('getEnabledModules — Contextual UI module resolution', () => {
    it('prefers effectiveModules when present', () => {
        expect(
            getEnabledModules(
                project('p1', {
                    effectiveModules: ['chat'],
                    enabledModules: ['contacts', 'deals'],
                }),
            ),
        ).toEqual(['chat'])
    })

    it('falls back to enabled moduleConfigs, then enabledModules', () => {
        expect(
            getEnabledModules(
                project('p2', {
                    enabledModules: [],
                    moduleConfigs: [
                        {
                            moduleId: 'deals',
                            enabled: true,
                            personalSettings: {},
                            integrationSettings: {},
                            integrationMethodsEnabled: [],
                        },
                        {
                            moduleId: 'orders',
                            enabled: false,
                            personalSettings: {},
                            integrationSettings: {},
                            integrationMethodsEnabled: [],
                        },
                    ],
                }),
            ),
        ).toEqual(['deals'])

        expect(
            getEnabledModules(project('p3', { enabledModules: ['contacts'] })),
        ).toEqual(['contacts'])
    })

    it('for a null project returns [] — no fail-open default set (TODO-455)', () => {
        // Before TODO-455 this returned a hardcoded 9-module list, so until the
        // project loaded the UI advertised modules that may be switched OFF
        // (chat button, notification polls, menu entries) and the portfolio guard
        // treated disabled routes as enabled. «Not loaded yet» is now the caller's
        // job (usePlatformModules().ready), not a fabricated module list.
        expect(getEnabledModules(null)).toEqual([])
    })

    it('for a project with NO modules at all returns [] (fail-closed)', () => {
        expect(
            getEnabledModules(
                project('p4', {
                    enabledModules: [],
                    moduleConfigs: [],
                    effectiveModules: [],
                }),
            ),
        ).toEqual([])
    })

    it('for a project whose every moduleConfig is disabled returns [] (fail-closed)', () => {
        expect(
            getEnabledModules(
                project('p5', {
                    enabledModules: [],
                    effectiveModules: [],
                    moduleConfigs: [
                        {
                            moduleId: 'deals',
                            enabled: false,
                            personalSettings: {},
                            integrationSettings: {},
                            integrationMethodsEnabled: [],
                        },
                    ],
                }),
            ),
        ).toEqual([])
    })
})
