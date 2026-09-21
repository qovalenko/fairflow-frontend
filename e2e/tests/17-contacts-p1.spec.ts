import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, STORAGE_KEYS } from '../support/env'
import {
    CONTACTS_FORBIDDEN_ALLOW,
    CONTACTS_OWNER_UNASSIGNED,
    gotoContacts,
    omitContactsPermissions,
    openContactsSettings,
    pickFilterOption,
    seedContactsProject,
} from '../support/contacts'
import { gotoAuthenticated } from '../support/login'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts list filters P1', () => {
    test.fixme(
        '#9: BUG ownerScope=__unassigned__ ignored on the stand — assignee filter does not narrow list: unassigned filter shows contacts without owner',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-unassigned'))
        const tag = uniqueName('unassigned').replace(/[^a-zA-Z0-9-]/g, '')
        const members = await api.listMembers(pid)
        test.skip(members.length < 1, 'need project members on stand')
        let orphanId: string | undefined
        let ownedId: string | undefined
        try {
            orphanId = await api.createContact(pid, {
                firstName: 'Orphan',
                lastName: tag,
                email: `${tag}orphan@example.test`,
            })
            ownedId = await api.createContact(pid, {
                firstName: 'Owned',
                lastName: tag,
                email: `${tag}owned@example.test`,
                assigneeId: members[0]!.id,
            })
            await gotoContacts(page)
            await expect(byQa(page, 'contacts.list.row', { contact: orphanId })).toBeVisible({
                timeout: 30_000,
            })
            await pickFilterOption(page, 'contacts.list.filterAssignee', CONTACTS_OWNER_UNASSIGNED)
            await expect(byQa(page, 'contacts.list.row', { contact: orphanId })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: ownedId })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (orphanId) await api.deleteContact(pid, orphanId)
            if (ownedId) await api.deleteContact(pid, ownedId)
            await api.archiveProject(pid)
        }
    },
    )

    test.fixme(
        '#10: BUG filterTags query ignored on the stand — list returns all contacts: tags filter narrows list by tag',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-tags'))
        const tag = uniqueName('vip').replace(/[^a-zA-Z0-9-]/g, '')
        let taggedId: string | undefined
        let plainId: string | undefined
        try {
            taggedId = await api.createContact(pid, {
                firstName: 'Tagged',
                lastName: tag,
                email: `${tag}@example.test`,
                tags: ['vip'],
            })
            plainId = await api.createContact(pid, {
                firstName: 'Plain',
                lastName: tag,
                email: `plain-${tag}@example.test`,
            })
            await gotoContacts(page)
            await expect(byQa(page, 'contacts.list.row', { contact: taggedId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.list.filterTags').fill('vip')
            await expect(byQa(page, 'contacts.list.row', { contact: taggedId })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: plainId })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (taggedId) await api.deleteContact(pid, taggedId)
            if (plainId) await api.deleteContact(pid, plainId)
            await api.archiveProject(pid)
        }
    },
    )

    test.fixme(
        '#11: BUG inactiveDays filter ignored on the stand — recently active contact stays visible: inactive-days filter hides recently active contacts',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-inactive'), [
            'contacts',
            'activities',
        ])
        const tag = uniqueName('inactive').replace(/[^a-zA-Z0-9-]/g, '')
        let staleId: string | undefined
        let freshId: string | undefined
        try {
            staleId = await api.createContact(pid, {
                firstName: 'Stale',
                lastName: tag,
                email: `${tag}stale@example.test`,
            })
            freshId = await api.createContact(pid, {
                firstName: 'Fresh',
                lastName: tag,
                email: `${tag}fresh@example.test`,
            })
            await api.createActivity(pid, {
                title: uniqueName('recent'),
                links: [{ entityType: 'contact', entityId: freshId }],
            })
            await gotoContacts(page)
            await expect(byQa(page, 'contacts.list.row', { contact: staleId })).toBeVisible({
                timeout: 30_000,
            })
            await pickFilterOption(page, 'contacts.list.filterInactive', '7')
            await expect(byQa(page, 'contacts.list.row', { contact: staleId })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: freshId })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (staleId) await api.deleteContact(pid, staleId)
            if (freshId) await api.deleteContact(pid, freshId)
            await api.archiveProject(pid)
        }
    })

    test('#12: combined filters empty state offers reset', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-reset'))
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Visible',
                lastName: uniqueName('row'),
                email: `${uniqueName('row')}@example.test`,
            })
            await gotoContacts(page)
            await expect(byQa(page, 'contacts.list.row', { contact: id })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.list.search').fill(uniqueName('absent-needle'))
            await expect(byQa(page, 'contacts.list.emptyFilter')).toBeVisible({ timeout: 20_000 })
            await byQa(page, 'contacts.list.resetFilters').click()
            await expect(byQa(page, 'contacts.list.row', { contact: id })).toBeVisible({
                timeout: 20_000,
            })
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#13: BUG list total equals page length on the stand — page 2 never loads: pagination moves to the next page',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-pages'))
        const ids: string[] = []
        try {
            for (let i = 0; i < 12; i++) {
                const tag = uniqueName(`pg${i}`).replace(/[^a-zA-Z0-9-]/g, '')
                ids.push(
                    await api.createContact(pid, {
                        firstName: 'Page',
                        lastName: tag,
                        email: `${tag}@example.test`,
                    }),
                )
            }
            await gotoContacts(page)
            await expect(byQa(page, 'contacts.list.row').first()).toBeVisible({ timeout: 30_000 })
            const firstPageId = await byQa(page, 'contacts.list.row').first().getAttribute('data-qa-contact')
            await byQa(page, 'contacts.list.pageNext').click()
            await expect(byQa(page, 'contacts.list.row').first()).toBeVisible({ timeout: 30_000 })
            const secondPageId = await byQa(page, 'contacts.list.row')
                .first()
                .getAttribute('data-qa-contact')
            expect(secondPageId).not.toBe(firstPageId)
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#15: BUG sort click does not reorder rows on the stand hybrid: sort by name orders contacts alphabetically in the list',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-sort'))
        const ids: string[] = []
        try {
            ids.push(
                await api.createContact(pid, {
                    firstName: 'Zulu',
                    lastName: uniqueName('z'),
                    email: `${uniqueName('z')}@example.test`,
                }),
            )
            ids.push(
                await api.createContact(pid, {
                    firstName: 'Alpha',
                    lastName: uniqueName('a'),
                    email: `${uniqueName('a')}@example.test`,
                }),
            )
            await gotoContacts(page)
            const rows = byQa(page, 'contacts.list.row')
            await expect(rows.first()).toBeVisible({ timeout: 30_000 })
            await expect(rows.first()).toContainText('Zulu')
            await byQa(page, 'contacts.list.sort', { column: 'firstName' }).click()
            await expect(rows.first()).toContainText('Alpha', { timeout: 20_000 })
            await expect(rows.nth(1)).toContainText('Zulu', { timeout: 20_000 })
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    },
    )
})

test.describe('contacts permissions and navigation P1', () => {
    test.fixme(
        '#19: BUG omit contacts:read via PDP mock — list still renders for project owner on the stand: list without contacts:read shows no-permission state',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-noread'))
        try {
            await omitContactsPermissions(page, pid, ['contacts:read'])
            await gotoContacts(page)
            await expect(page.getByText('Раздел «Контакты» недоступен')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.table')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    },
    )

    test('#23: navigate to duplicate queue', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-dupnav'))
        try {
            await gotoContacts(page)
            await byQa(page, 'contacts.list.goDuplicates').click()
            await expect(page).toHaveURL(/\/contacts\/duplicates/)
            await expect(byQa(page, 'contacts.duplicates.heading')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#155: BUG empty-project guard not reached — host redirects before contacts.list.noProject mounts: without selected project shows empty-project guard',
        async ({ page }) => {
        await page.addInitScript(
            ({ idKey, projKey, sessionKey }) => {
                localStorage.removeItem(idKey)
                localStorage.removeItem(projKey)
                const raw = localStorage.getItem(sessionKey)
                if (!raw) return
                try {
                    const envelope = JSON.parse(raw) as {
                        state?: { user?: { projects?: unknown[] } }
                    }
                    if (envelope.state?.user) envelope.state.user.projects = []
                    localStorage.setItem(sessionKey, JSON.stringify(envelope))
                } catch {
                    /* route stub below is the real gate */
                }
            },
            {
                idKey: STORAGE_KEYS.projectId,
                projKey: STORAGE_KEYS.project,
                sessionKey: STORAGE_KEYS.sessionUser,
            },
        )
        await page.route(/\/v1\/projects\/?(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '[]',
            })
        })
        await gotoContacts(page)
        await expect(byQa(page, 'contacts.list.noProject')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText('Проект не выбран')).toBeVisible()
    },
    )
})

test.describe('contacts details and call actions P1', () => {
    test.fixme(
        '#72: BUG GET /v1/contacts/:invalidId returns 500 not 404 — UI shows error not «Контакт не найден»: missing contact shows 404 screen',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-404'))
        try {
            await gotoContacts(page, '/contacts/000000000000000000000000')
            await expect(page.getByText('Контакт не найден')).toBeVisible({ timeout: 30_000 })
            await expect(page.getByRole('button', { name: 'Вернуться к списку' })).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    },
    )

    test.fixme(
        '#74: BUG omit contacts:read — card still loads for project owner on the stand: card without contacts:read is gated',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-card-noread'))
        const id = await api.createContact(pid, {
            firstName: 'Hidden',
            lastName: uniqueName('card'),
            email: `${uniqueName('card')}@example.test`,
        })
        try {
            await omitContactsPermissions(page, pid, ['contacts:read'])
            await gotoContacts(page, `/contacts/${id}`)
            await expect(page.getByText('Карточка контакта недоступна')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    },
    )

    test('#79: tel link href contains dialable digits', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-tel'))
        const tag = uniqueName('tel').replace(/[^a-zA-Z0-9-]/g, '')
        const phone = '+7 (999) 123-45-67'
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Phone',
                lastName: tag,
                email: `${tag}@example.test`,
                phone,
            })
            await gotoContacts(page, `/contacts/${id}`)
            const href = await byQa(page, 'contacts.details.phoneLink').getAttribute('href')
            expect(href).toMatch(/^tel:\d+$/)
            expect(href!.replace(/\D/g, '')).toContain('79991234567')
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#80: mailto link opens email client href', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-mailto'))
        const tag = uniqueName('mailto').replace(/[^a-zA-Z0-9-]/g, '')
        const email = `${tag}@example.test`
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Mail',
                lastName: tag,
                email,
                phone: '+79990001122',
            })
            await gotoContacts(page, `/contacts/${id}`)
            await expect(byQa(page, 'contacts.details.emailLink')).toHaveAttribute(
                'href',
                `mailto:${email}`,
            )
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#82: email-only contact has no tel link', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-email-only'))
        const tag = uniqueName('emailonly').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Email',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await gotoContacts(page, `/contacts/${id}`)
            await expect(byQa(page, 'contacts.details.emailLink')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'contacts.details.phoneLink')).toHaveCount(0)
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#76: BUG merged source tombstone GET returns 500 not 404 on the stand: merged source tombstone shows 404',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-tombstone'))
        const tag = uniqueName('tomb').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'Source',
                lastName: tag,
                email: `${tag}s@example.test`,
            })
            targetId = await api.createContact(pid, {
                firstName: 'Target',
                lastName: tag,
                email: `${tag}t@example.test`,
            })
            await gotoContacts(page, `/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(byQa(page, 'contacts.merge.submit')).toBeVisible({ timeout: 30_000 })
            const mergeReq = page.waitForResponse(
                (r) => r.url().includes('/v1/contacts/merge') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.merge.submit').click()
            await mergeReq
            await expect(page).toHaveURL(new RegExp(`/contacts/${targetId}$`), { timeout: 30_000 })
            await gotoContacts(page, `/contacts/${sourceId}`)
            await expect(page.getByText('Контакт не найден')).toBeVisible({ timeout: 30_000 })
            targetId = undefined
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    },
    )
})

test.describe('contacts edit P1', () => {
    test.fixme(
        '#85: BUG edit save without phone/email — validation toast not shown on the stand: save without phone and email shows validation toast',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-edit-val'))
        const tag = uniqueName('val').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Valid',
                lastName: tag,
                email: `${tag}@example.test`,
                phone: '+79990001122',
            })
            await gotoContacts(page, `/contacts/${id}/edit`)
            await expect(byQa(page, 'contacts.edit.email')).toHaveValue(`${tag}@example.test`, {
                timeout: 30_000,
            })
            await byQa(page, 'contacts.edit.phone').fill('')
            await byQa(page, 'contacts.edit.email').fill('')
            await byQa(page, 'contacts.edit.save').click()
            await expect(page.getByText('Укажите телефон или email')).toBeVisible({
                timeout: 10_000,
            })
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    },
    )

    test('#86: dirty guard asks before leaving edit', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-dirty'))
        const tag = uniqueName('dirty').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Dirty',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await gotoContacts(page, `/contacts/${id}/edit`)
            await expect(byQa(page, 'contacts.edit.firstName')).toHaveValue('Dirty', {
                timeout: 30_000,
            })
            await byQa(page, 'contacts.edit.firstName').fill('Changed')
            page.once('dialog', (dialog) => {
                expect(dialog.message()).toContain('несохранённые изменения')
                dialog.dismiss()
            })
            await byQa(page, 'contacts.edit.back').click()
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}/edit$`))
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#92: edit without contacts:write is gated', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-edit-nowrite'))
        const id = await api.createContact(pid, {
            firstName: 'Read',
            lastName: uniqueName('only'),
            email: `${uniqueName('only')}@example.test`,
        })
        try {
            await omitContactsPermissions(page, pid, ['contacts:write'])
            await gotoContacts(page, `/contacts/${id}/edit`)
            await expect(page.getByText('Редактирование недоступно')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#93: BUG edit GET invalid id returns 500 not 404 on the stand: edit missing contact shows 404',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-edit-404'))
        try {
            await gotoContacts(page, '/contacts/000000000000000000000000/edit')
            await expect(page.getByText('Контакт не найден')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    },
    )
})

test.describe('contacts trash P1', () => {
    test('#98: empty trash shows positive empty state', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-trash-empty'))
        try {
            await gotoContacts(page, '/contacts/trash')
            await expect(page.getByText('Корзина пуста')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#101: BUG POST /v1/contacts 500 after trash when phone collides with active contact: restore collision opens strategy dialog',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-restore-col'))
        const tag = uniqueName('collision').replace(/[^a-zA-Z0-9-]/g, '')
        const phone = '+79991112233'
        let occupantId: string | undefined
        let trashedId: string | undefined
        try {
            trashedId = await api.createContact(pid, {
                firstName: 'Trashed',
                lastName: tag,
                email: `${tag}tr@example.test`,
                phone,
            })
            await api.deleteContact(pid, trashedId)
            occupantId = await api.createContact(pid, {
                firstName: 'Occupant',
                lastName: `${tag}B`,
                email: `${tag}oc@example.test`,
                phone,
            })
            await gotoContacts(page, '/contacts/trash')
            await expect(byQa(page, 'contacts.trash.restore', { contact: trashedId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.trash.restore', { contact: trashedId }).click()
            await expect(byQa(page, 'contacts.trash.collisionHeading')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.trash.collisionClearKeys')).toBeVisible()
            await expect(byQa(page, 'contacts.trash.collisionMerge')).toBeVisible()
        } finally {
            if (trashedId) await api.deleteContact(pid, trashedId).catch(() => {})
            if (occupantId) await api.deleteContact(pid, occupantId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#107: BUG omit contacts:read — trash list still loads for project owner: trash without contacts:read is gated',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-trash-noread'))
        try {
            await omitContactsPermissions(page, pid, ['contacts:read'])
            await gotoContacts(page, '/contacts/trash')
            await expect(page.getByText('Раздел недоступен')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    },
    )
})

test.describe('contacts merge P1', () => {
    test('#110: master selection switches merge target', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-merge-master'))
        const tag = uniqueName('master').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'Source',
                lastName: tag,
                email: `${tag}s@example.test`,
            })
            targetId = await api.createContact(pid, {
                firstName: 'Target',
                lastName: tag,
                email: `${tag}t@example.test`,
            })
            await gotoContacts(page, `/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(byQa(page, 'contacts.merge.master', { contact: targetId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.merge.master', { contact: sourceId }).click()
            await expect(byQa(page, 'contacts.merge.master', { contact: sourceId })).toHaveClass(
                /border-primary/,
            )
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#111: survivor field pick highlights chosen value', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-merge-field'))
        const tag = uniqueName('field').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'A',
                lastName: tag,
                email: `${tag}a@example.test`,
                phone: '+79991111111',
            })
            targetId = await api.createContact(pid, {
                firstName: 'B',
                lastName: tag,
                email: `${tag}b@example.test`,
                phone: '+79992222222',
            })
            await gotoContacts(page, `/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(byQa(page, 'contacts.merge.survivor', { field: 'phone', side: 'a' })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.merge.survivor', { field: 'phone', side: 'b' }).click()
            await expect(
                byQa(page, 'contacts.merge.survivor', { field: 'phone', side: 'b' }),
            ).toHaveClass(/text-primary/)
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#113: merge without contacts:manage is gated', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-merge-nomanage'))
        const tag = uniqueName('nomerge').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'S',
                lastName: tag,
                email: `${tag}s@example.test`,
            })
            targetId = await api.createContact(pid, {
                firstName: 'T',
                lastName: tag,
                email: `${tag}t@example.test`,
            })
            await omitContactsPermissions(page, pid, ['contacts:manage'])
            await gotoContacts(page, `/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(page.getByText('Слияние требует роли Manager')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#114: BUG omit contacts:read — merge screen still loads for project owner: merge without contacts:read is gated',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-merge-noread'))
        try {
            await omitContactsPermissions(page, pid, ['contacts:read'])
            await gotoContacts(page, '/contacts/merge?source=a&target=b')
            await expect(page.getByText('Слияние недоступно')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    },
    )

    test('#115: invalid merge params show message', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-merge-bad'))
        const id = await api.createContact(pid, {
            firstName: 'Same',
            lastName: uniqueName('same'),
            email: `${uniqueName('same')}@example.test`,
        })
        try {
            await gotoContacts(page, `/contacts/merge?source=${id}&target=${id}`)
            await expect(
                page.getByText('Не выбраны два разных контакта для слияния'),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })
})

test.describe('contacts duplicates and import P1', () => {
    test('#122: duplicate queue empty state', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-dup-empty'))
        try {
            await gotoContacts(page, '/contacts/duplicates')
            await expect(page.getByText('Дублей не найдено')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#127: duplicates without contacts:manage is gated', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-dup-nomanage'))
        try {
            await omitContactsPermissions(page, pid, ['contacts:manage'])
            await gotoContacts(page, '/contacts/duplicates')
            await expect(page.getByText('Раздел недоступен')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#131: import without contacts:import is gated', async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-import-noright'))
        try {
            await omitContactsPermissions(page, pid, ['contacts:import'])
            await gotoContacts(page, '/contacts/import')
            await expect(page.getByText('Импорт контактов недоступен')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})

test.describe('contacts settings and cross-module P1', () => {
    test.fixme(
        '#149: BUG omit project:manage — settings tab still renders for project owner: settings without project:manage shows message',
        async ({ page, api, useProject }) => {
        const pid = await seedContactsProject(api, useProject, uniqueName('co-settings-nomanage'))
        try {
            await omitContactsPermissions(page, pid, ['project:manage'])
            await openContactsSettings(page, pid)
            await expect(page.getByText(/Нужно право project:manage/)).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    },
    )

    test('#150: settings when module disabled shows message', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('co-mod-off'), ['deals'])
        await useProject(pid, ['deals'])
        try {
            await gotoAuthenticated(page, `/account/projects/${pid}/settings?tab=module:contacts`)
            await expect(page.getByText(/Модуль «Контакты» выключен/)).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#145: BUG deal.card.tab requiresContext contactId — tab never mounts for contactless deal: deal without contact shows empty tab message',
        async ({ page, api, useProject }) => {
        test.skip(process.env.E2E_DEALS !== '1', 'needs local deals remote with qa-ids (run-hybrid sets E2E_DEALS=1)')
        const pid = await seedContactsProject(api, useProject, uniqueName('co-deal-empty'))
        let dealId: string | undefined
        try {
            dealId = await api.createDeal(pid, {
                name: uniqueName('no-contact'),
                amount: 1000,
            })
            await gotoAuthenticated(page, `/deals/${dealId}`)
            await expect(page.getByText(/Сделка без связанного контакта/)).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test.fixme(
        '#146: BUG PermissionCheck hides deal.card.tab before DealCardContactTab internal contacts:read gate: deal contact tab without contacts:read is gated',
        async ({ page, api, useProject }) => {
        test.skip(process.env.E2E_DEALS !== '1', 'needs local deals remote with qa-ids (run-hybrid sets E2E_DEALS=1)')
        const pid = await seedContactsProject(api, useProject, uniqueName('co-deal-noread'))
        let contactId: string | undefined
        let dealId: string | undefined
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Linked',
                lastName: uniqueName('deal'),
                email: `${uniqueName('deal')}@example.test`,
            })
            dealId = await api.createDeal(pid, {
                name: uniqueName('with-contact'),
                amount: 1000,
                contactId,
            })
            await omitContactsPermissions(page, pid, ['contacts:read'])
            await gotoAuthenticated(page, `/deals/${dealId}`)
            await expect(page.getByText(/Контакт недоступен \(contacts:read\)/)).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
