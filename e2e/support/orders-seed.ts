import type { ApiClient } from '../fixtures/api'
import { uniqueName } from './env'

export type OrdersSeed = {
    projectId: string
    typeA: { id: string; name: string; stageStartId: string; stageDoneId: string }
    typeB: { id: string; name: string; stageStartId: string }
    pipelineId: string
    wonStageId: string
    contactId: string
    companyId: string
    dealId: string
    wonDealId: string
    productAId: string
    productBId: string
}

/** Minimal order type with two stages; terminal stage uses finalAction none. */
export function orderTypePayload(name: string, stageStart = 'st-start', stageDone = 'st-done') {
    return {
        name,
        fields: [],
        stages: [
            {
                id: stageStart,
                name: 'Старт',
                order: 0,
                requiredFieldKeys: [],
                isTerminal: false,
            },
            {
                id: stageDone,
                name: 'Финиш',
                order: 1,
                requiredFieldKeys: [],
                isTerminal: true,
            },
        ],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: {
            maxAttempts: 3,
            strategy: 'exponential',
            baseIntervalSec: 60,
            maxWaitSec: 3600,
        },
    }
}

/** Seed a project with pipelines, contacts, order types, products, deals for orders e2e. */
export async function seedOrdersProject(
    api: ApiClient,
    modules: string[] = ['deals', 'contacts', 'orders', 'products'],
): Promise<OrdersSeed> {
    const projectId = await api.createProject(uniqueName('orders'), modules)

    const pipelines = await api.listPipelines(projectId)
    const pipeline = pipelines[0]
    if (!pipeline?.id || !pipeline.stages?.length) {
        throw new Error('seedOrdersProject: no pipeline/stages in project')
    }
    const wonStage =
        pipeline.stages.find((s) => /won|выигр/i.test(s.name)) ??
        pipeline.stages[pipeline.stages.length - 1]

    const typeAName = uniqueName('type-a')
    const typeBName = uniqueName('type-b')
    const typeAId = await api.createOrderType(
        projectId,
        orderTypePayload(typeAName, 'st-a1', 'st-a2'),
    )
    const typeBId = await api.createOrderType(
        projectId,
        orderTypePayload(typeBName, 'st-b1', 'st-b2'),
    )

    const contactId = await api.createContact(projectId, {
        firstName: 'T029',
        lastName: uniqueName('ord-contact'),
        email: `${uniqueName('c')}@example.test`,
    })
    const companyId = await api.createCompany(projectId, {
        name: uniqueName('ord-co'),
    })

    const dealId = await api.createDeal(projectId, {
        name: uniqueName('deal-open'),
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        contactId,
        companyId,
    })

    const wonDealId = await api.createDeal(projectId, {
        name: uniqueName('deal-won'),
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        contactId,
        companyId,
    })
    await api.closeDeal(projectId, wonDealId, 'won')

    const productAId = await api.createProduct(projectId, {
        name: uniqueName('prod-a'),
        orderTypeId: typeAId,
    })
    const productBId = await api.createProduct(projectId, {
        name: uniqueName('prod-b'),
        orderTypeId: typeBId,
    })

    return {
        projectId,
        typeA: { id: typeAId, name: typeAName, stageStartId: 'st-a1', stageDoneId: 'st-a2' },
        typeB: { id: typeBId, name: typeBName, stageStartId: 'st-b1' },
        pipelineId: pipeline.id,
        wonStageId: wonStage.id,
        contactId,
        companyId,
        dealId,
        wonDealId,
        productAId,
        productBId,
    }
}

/** Create an ACTIVE order on type A at start stage. */
export async function seedActiveOrder(
    api: ApiClient,
    seed: OrdersSeed,
    dealId = seed.wonDealId,
): Promise<string> {
    return api.createOrder(seed.projectId, {
        dealId,
        orderTypeId: seed.typeA.id,
        contactId: seed.contactId,
        companyId: seed.companyId,
    })
}
