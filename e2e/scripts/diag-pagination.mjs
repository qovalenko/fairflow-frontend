/**
 * One-off: compare companies list total at pageSize=200 vs pageSize=10.
 * Run: STAND_IP=... NODE_EXTRA_CA_CERTS=... node --require ../support/dns-shim.cjs diag-pagination.mjs
 */
import { request } from '@playwright/test'

const API = process.env.API_BASE_URL || 'https://stand.example.com/api'
const EMAIL = process.env.E2E_EMAIL || 'admin@fairflow.local'
const PASS = process.env.E2E_PASSWORD || 'admin'

async function login(ctx) {
    for (let i = 0; i < 4; i++) {
        const res = await ctx.post(`${API}/v1/auth/login`, { data: { email: EMAIL, password: PASS } })
        if (res.ok()) {
            const body = await res.json()
            return { token: body.token, userId: body.user.userId }
        }
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
    throw new Error('login failed')
}

async function main() {
    const ctx = await request.newContext({ ignoreHTTPSErrors: true })
    const { token, userId } = await login(ctx)
    const h = (pid) => ({ Authorization: `Bearer ${token}`, 'X-Project-Id': pid })

    const proj = await ctx.post(`${API}/v1/projects`, {
        headers: h(),
        data: {
            ownerType: 'PERSONAL',
            ownerId: userId,
            name: `t029-diag-${Date.now()}`,
            templateId: 'blank',
            modules: ['companies', 'contacts', 'deals'],
        },
    })
    const { id: pid } = await proj.json()
    console.log('project', pid)

    for (let i = 0; i < 12; i++) {
        const res = await ctx.post(`${API}/v1/companies`, {
            headers: h(pid),
            params: { projectId: pid },
            data: { name: `t029-diag-co-${Date.now()}-${i}` },
        })
        if (!res.ok()) console.error('create fail', i, res.status(), await res.text())
    }

    const big = await ctx.get(`${API}/v1/companies`, {
        headers: h(pid),
        params: { projectId: pid, pageSize: 200 },
    })
    const bigBody = await big.json()
    console.log('pageSize=200:', { total: bigBody.total, listLen: bigBody.list?.length })

    const p1 = await ctx.get(`${API}/v1/companies`, {
        headers: h(pid),
        params: { projectId: pid, pageSize: 10, pageIndex: 0 },
    })
    const p1Body = await p1.json()
    console.log('pageSize=10 pageIndex=0:', { total: p1Body.total, listLen: p1Body.list?.length })

    const p2 = await ctx.get(`${API}/v1/companies`, {
        headers: h(pid),
        params: { projectId: pid, pageSize: 10, pageIndex: 1 },
    })
    const p2Body = await p2.json()
    console.log('pageSize=10 pageIndex=1:', { total: p2Body.total, listLen: p2Body.list?.length })

    await ctx.delete(`${API}/v1/projects/${pid}`, { headers: h() })
    await ctx.dispose()
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
