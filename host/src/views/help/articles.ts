/**
 * Реестр статей Центра поддержки.
 *
 * Контент статей — реальные markdown-файлы в ./content, написанные на основе
 * функциональной документации и фактической реализации приложения. Тексты
 * подгружаются как сырой markdown (Vite `?raw`) и рендерятся в ArticleView.
 *
 * Метаданные (заголовок, описание, время чтения) — здесь; время чтения
 * считается из объёма реального текста, а не задаётся вручную.
 */
import {
    PiRocketLaunchDuotone,
    PiBookOpenDuotone,
    PiHouseDuotone,
    PiShieldCheckDuotone,
    PiBuildingsDuotone,
    PiGearDuotone,
    PiChartLineDuotone,
    PiAddressBookDuotone,
    PiHandshakeDuotone,
    PiShoppingCartDuotone,
    PiCalendarDuotone,
    PiPackageDuotone,
    PiChartBarDuotone,
    PiFileTextDuotone,
    PiFlowArrowDuotone,
} from 'react-icons/pi'
import type { ComponentType } from 'react'

// Сырой markdown статей (типизируется как string через vite/client).
import gettingStarted from './content/getting-started.md?raw'
import authOnboarding from './content/auth-onboarding.md?raw'
import homeProjects from './content/home-projects.md?raw'
import profileSecurity from './content/profile-security.md?raw'
import organization from './content/organization.md?raw'
import projectSettings from './content/project-settings.md?raw'
import dashboardStatistics from './content/dashboard-statistics.md?raw'
import contacts from './content/contacts.md?raw'
import companies from './content/companies.md?raw'
import deals from './content/deals.md?raw'
import orders from './content/orders.md?raw'
import activities from './content/activities.md?raw'
import products from './content/products.md?raw'
import reports from './content/reports.md?raw'
import documents from './content/documents.md?raw'
import automation from './content/automation.md?raw'

export type HelpCategoryKey = 'start' | 'account' | 'project' | 'crm'

export type HelpCategory = {
    key: HelpCategoryKey
    name: string
}

export type HelpArticle = {
    slug: string
    title: string
    summary: string
    category: HelpCategoryKey
    icon: ComponentType<{ className?: string }>
    body: string
    /** Время чтения в минутах — вычисляется из объёма текста. */
    timeToRead: number
}

/** Группы статей в порядке отображения на обзорной странице. */
export const helpCategories: HelpCategory[] = [
    { key: 'start', name: 'Начало работы' },
    { key: 'account', name: 'Авторизация и аккаунт' },
    { key: 'project', name: 'Проект' },
    { key: 'crm', name: 'Портфель (CRM)' },
]

export const helpCategoryLabel: Record<HelpCategoryKey, string> =
    helpCategories.reduce(
        (acc, c) => ({ ...acc, [c.key]: c.name }),
        {} as Record<HelpCategoryKey, string>,
    )

/** ~180 слов в минуту, минимум 2 минуты. */
const readingTime = (markdown: string): number => {
    const words = markdown.trim().split(/\s+/).filter(Boolean).length
    return Math.max(2, Math.round(words / 180))
}

type ArticleSeed = Omit<HelpArticle, 'timeToRead'>

const seeds: ArticleSeed[] = [
    {
        slug: 'getting-started',
        title: 'Обзор Fairflow: проекты, модули и роли',
        summary:
            'С чего начать: ключевые понятия, навигация и логика платформы.',
        category: 'start',
        icon: PiRocketLaunchDuotone,
        body: gettingStarted,
    },
    {
        slug: 'auth-onboarding',
        title: 'Вход, регистрация и онбординг',
        summary:
            'Регистрация физлица или организации, вход, 2FA, приглашения, первые шаги.',
        category: 'account',
        icon: PiBookOpenDuotone,
        body: authOnboarding,
    },
    {
        slug: 'home-projects',
        title: 'Главная и список проектов',
        summary: 'Главная страница, список проектов и создание нового проекта.',
        category: 'account',
        icon: PiHouseDuotone,
        body: homeProjects,
    },
    {
        slug: 'profile-security',
        title: 'Профиль, безопасность и сессии',
        summary: 'Личные данные, смена email и пароля, 2FA, активные сессии.',
        category: 'account',
        icon: PiShieldCheckDuotone,
        body: profileSecurity,
    },
    {
        slug: 'organization',
        title: 'Система: реквизиты, подразделения и сотрудники',
        summary:
            'Реквизиты компании, структура подразделений, сотрудники, приглашения, аудит.',
        category: 'account',
        icon: PiBuildingsDuotone,
        body: organization,
    },
    {
        slug: 'project-settings',
        title: 'Управление проектом: модули, роли и политики',
        summary:
            'Настройки проекта, включение модулей, участники, роли и политики доступа.',
        category: 'project',
        icon: PiGearDuotone,
        body: projectSettings,
    },
    {
        slug: 'dashboard-statistics',
        title: 'Дашборд и статистика проекта',
        summary: 'Виджеты дашборда и аналитические срезы статистики проекта.',
        category: 'project',
        icon: PiChartLineDuotone,
        body: dashboardStatistics,
    },
    {
        slug: 'contacts',
        title: 'Контакты',
        summary: 'Список контактов, карточка, импорт, дубли и редактирование.',
        category: 'crm',
        icon: PiAddressBookDuotone,
        body: contacts,
    },
    {
        slug: 'companies',
        title: 'Компании',
        summary: 'Список компаний, реквизиты, связанные сделки и продажи.',
        category: 'crm',
        icon: PiBuildingsDuotone,
        body: companies,
    },
    {
        slug: 'deals',
        title: 'Сделки и воронки',
        summary:
            'Список и канбан сделок, карточка, настройка воронок и стадий.',
        category: 'crm',
        icon: PiHandshakeDuotone,
        body: deals,
    },
    {
        slug: 'orders',
        title: 'Продажи и типы продаж',
        summary:
            'Оформление продаж, этапы, документы и конструктор типов продаж.',
        category: 'crm',
        icon: PiShoppingCartDuotone,
        body: orders,
    },
    {
        slug: 'activities',
        title: 'Активности и календарь',
        summary: 'Задачи, звонки и встречи в виде списка и календаря.',
        category: 'crm',
        icon: PiCalendarDuotone,
        body: activities,
    },
    {
        slug: 'products',
        title: 'Продукты и цены',
        summary: 'Каталог продуктов, карточка, единицы цены и прайс-лист.',
        category: 'crm',
        icon: PiPackageDuotone,
        body: products,
    },
    {
        slug: 'reports',
        title: 'Отчёты',
        summary: 'Готовые отчёты и конструктор собственных отчётов.',
        category: 'crm',
        icon: PiChartBarDuotone,
        body: reports,
    },
    {
        slug: 'documents',
        title: 'Документы и шаблоны',
        summary: 'Документы проекта, шаблоны и генерация по шаблону.',
        category: 'crm',
        icon: PiFileTextDuotone,
        body: documents,
    },
    {
        slug: 'automation',
        title: 'Автоматизация',
        summary: 'Правила «триггер → условие → действие» и их настройка.',
        category: 'crm',
        icon: PiFlowArrowDuotone,
        body: automation,
    },
]

/**
 * Статьи, скрытые в режиме production-launch (как и соответствующие маршруты).
 * box: биллинга нет — скрывать нечего (список пуст; механизм оставлен на будущее).
 */
const launchHiddenSlugs = new Set<string>()

export const helpArticles: HelpArticle[] = seeds
    .filter((a) => !launchHiddenSlugs.has(a.slug))
    .map((a) => ({ ...a, timeToRead: readingTime(a.body) }))

/** Рекомендованные статьи для обзорной страницы (в порядке показа). */
const recommendedSlugs = [
    'getting-started',
    'deals',
    'project-settings',
    'contacts',
    'orders',
    'automation',
]

export const recommendedArticles: HelpArticle[] = recommendedSlugs
    .map((slug) => helpArticles.find((a) => a.slug === slug))
    .filter((a): a is HelpArticle => Boolean(a))

export const getArticle = (slug?: string): HelpArticle | undefined =>
    helpArticles.find((a) => a.slug === slug)

export const articlesByCategory = (category: HelpCategoryKey): HelpArticle[] =>
    helpArticles.filter((a) => a.category === category)

/** Смежные статьи из той же категории (без текущей). */
export const relatedArticles = (
    article: HelpArticle,
    limit = 4,
): HelpArticle[] =>
    helpArticles
        .filter(
            (a) => a.category === article.category && a.slug !== article.slug,
        )
        .slice(0, limit)

/** Поиск по заголовку, описанию, категории и тексту статьи. */
export const searchArticles = (query: string): HelpArticle[] => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return helpArticles.filter(
        (a) =>
            a.title.toLowerCase().includes(q) ||
            a.summary.toLowerCase().includes(q) ||
            helpCategoryLabel[a.category].toLowerCase().includes(q) ||
            a.body.toLowerCase().includes(q),
    )
}
