import type { ProjectTemplate } from '@/services/CrmService'

/**
 * FE fallback for the project-templates catalog (FR-ONB-2, OQ-UX-ONB-7).
 *
 * The authoritative source is `GET /api/project-templates` (backed by
 * `@fairflow/shared` PROJECT_TEMPLATES). This constant is used ONLY when that
 * request fails, so the wizard degrades to a working catalog instead of a
 * dead step-1 (ST-6). It mirrors the 5 builtin templates (canon §6.2) with
 * the minimum shape the wizard needs; it is intentionally NOT the primary path.
 */
export const FALLBACK_PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: 'b2b-sales',
        name: 'Продажи B2B',
        description: 'Для управления B2B-продажами: воронка, контакты, компании.',
        recommended: true,
        modules: ['deals', 'contacts', 'companies', 'activities'],
        pipeline: {
            name: 'Воронка продаж',
            stages: [
                { id: 'new', name: 'Новые' },
                { id: 'qualify', name: 'Квалификация' },
                { id: 'nego', name: 'Переговоры' },
                { id: 'won', name: 'Выиграно' },
                { id: 'lost', name: 'Проиграно' },
            ],
        },
    },
    {
        id: 'call-center',
        name: 'Колл-центр',
        description: 'Управление звонками и клиентской поддержкой.',
        modules: ['deals', 'contacts', 'activities'],
        pipeline: {
            name: 'Обработка обращений',
            stages: [
                { id: 'new', name: 'Новые' },
                { id: 'inwork', name: 'В работе' },
                { id: 'done', name: 'Закрыто' },
            ],
        },
    },
    {
        id: 'car-dealer',
        name: 'Автосалон',
        description: 'Продажи автомобилей и управление складом.',
        modules: ['deals', 'contacts', 'companies', 'orders', 'products'],
        pipeline: {
            name: 'Продажа авто',
            stages: [
                { id: 'lead', name: 'Заявка' },
                { id: 'testdrive', name: 'Тест-драйв' },
                { id: 'deal', name: 'Сделка' },
                { id: 'won', name: 'Продано' },
            ],
        },
    },
    {
        id: 'delivery',
        name: 'Доставка',
        description: 'Управление продажами и логистикой.',
        modules: ['deals', 'contacts', 'orders', 'products', 'activities'],
        pipeline: {
            name: 'Доставка',
            stages: [
                { id: 'order', name: 'Заказ' },
                { id: 'pack', name: 'Сборка' },
                { id: 'ship', name: 'Отгрузка' },
                { id: 'delivered', name: 'Доставлено' },
            ],
        },
    },
    {
        id: 'default',
        name: 'По умолчанию',
        description: 'Базовый шаблон для начала работы.',
        modules: ['deals', 'contacts'],
        pipeline: {
            name: 'Базовая воронка',
            stages: [
                { id: 'new', name: 'Новые' },
                { id: 'inwork', name: 'В работе' },
                { id: 'done', name: 'Завершено' },
            ],
        },
    },
]

/** UI metadata for all known modules (labels for step 3 toggles). */
export const MODULE_LABELS: Record<string, { name: string; description: string }> = {
    deals: { name: 'Сделки', description: 'Управление сделками и воронкой продаж' },
    contacts: { name: 'Контакты', description: 'База контактов и клиентов' },
    companies: { name: 'Компании', description: 'Управление компаниями' },
    orders: { name: 'Продажи', description: 'Обработка и отслеживание продаж' },
    products: { name: 'Продукты', description: 'Каталог продуктов и услуг' },
    activities: { name: 'Активности', description: 'Задачи, звонки, встречи' },
    reports: { name: 'Отчёты', description: 'Аналитика и отчёты' },
    settings: { name: 'Настройки', description: 'Настройки проекта' },
    integrations: { name: 'Интеграции', description: 'Подключение внешних сервисов' },
}

/** Module that is always on (FR-ONB-4): the pipeline is created regardless. */
export const LOCKED_MODULE_ID = 'deals'

/** Full ordered list of modules shown as toggles on step 3 (AS-IS parity). */
export const ALL_MODULE_IDS = [
    'deals',
    'contacts',
    'companies',
    'orders',
    'products',
    'activities',
    'reports',
    'settings',
    'integrations',
] as const
