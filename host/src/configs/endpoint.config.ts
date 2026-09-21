export const apiPrefix = '/api'

/**
 * Real auth service (Nest): login/logout + forgot/reset password + verify-email.
 * the box stand is invite-only — there is NO public self-registration endpoint here
 * (POST /v1/auth/register answers 403 REGISTRATION_DISABLED); accounts are
 * created only via first-run bootstrap and invite-accept.
 */
const endpointConfig = {
    signIn: '/v1/auth/login',
    signOut: '/v1/auth/logout',
    forgotPassword: '/v1/auth/forgot-password',
    resetPassword: '/v1/auth/reset-password',
}

export default endpointConfig
