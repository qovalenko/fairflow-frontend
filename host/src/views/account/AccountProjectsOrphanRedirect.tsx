import { Navigate } from 'react-router'

/**
 * FR-PSET-245 — legacy `/account/projects/*` deep-links (members, roles, audit,
 * pipelines, modules, settings/…) pointed at `AccountProjectsIndex` with
 * misleading titles and no project context. Redirect to the project picker so
 * the user chooses a project first; real settings live under
 * `/account/projects/:projectId/settings`.
 */
const AccountProjectsOrphanRedirect = () => <Navigate to="/account/projects" replace />

export default AccountProjectsOrphanRedirect
