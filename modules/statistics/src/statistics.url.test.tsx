/**
 * TODO-496 — период и произвольный диапазон области «Статистика» живут в URL.
 *
 * Что защищаем:
 *  1. смена периода ПИШЕТСЯ в query — `Dashboard.tsx` кладёт `s.period` в
 *     context-пропсы `<HostSlot id="dashboard.*">`; при локальном `useState`
 *     слоты (и вклады других модулей) не двигались;
 *  2. дефолт (`month`) параметр УБИРАЕТ — чистая ссылка = тот же вид, что читает host;
 *  3. ссылка/F5 восстанавливают вид И доносят его до запроса (обратное
 *     направление: `?from`/`?to` → epoch ms в `apiGetDashboard`).
 *
 * Мокаем ровно границы (QA-STRATEGY §7 FE): API-клиент, project-store, права,
 * UI-kit. Роутер — настоящий (`MemoryRouter`), состояние URL и есть предмет теста.
 */
import { MemoryRouter, useLocation } from 'react-router'
import { SWRConfig } from 'swr'
import { render, screen, act } from '@testing-library/react'
import {
    useStatistics,
    parsePeriodParam,
    parseRangeParams,
    writePeriodParams,
    parseSliceParam,
    writeSliceParam,
    DEFAULT_PERIOD,
    DEFAULT_SLICE,
    EMPTY_RANGE,
} from './statistics.shared'

const api = vi.hoisted(() => ({
    getDashboard: vi.fn(),
    getStatistics: vi.fn(),
}))

vi.mock('@/services/CrmService', () => ({
    apiGetDashboard: api.getDashboard,
    apiGetStatistics: api.getStatistics,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => 'p1',
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
vi.mock('@/store/projectStore', () => ({
    useProjectStore: (selector: (s: unknown) => unknown) =>
        selector({ currentProject: { id: 'p1' } }),
    getEnabledModules: () => ['statistics', 'deals', 'orders'],
}))
vi.mock('@fairflow/shared-ui', () => ({
    Card: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
    Container: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
    AdaptiveCard: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
}))

const Probe = () => {
    const s = useStatistics()
    const { search } = useLocation()
    return (
        <div>
            <span data-testid="search">{search}</span>
            <span data-testid="period">{s.period}</span>
            <span data-testid="range">{`${s.range.from}|${s.range.to}`}</span>
            <span data-testid="incomplete">{String(s.rangeIncomplete)}</span>
            <button onClick={() => s.setPeriod('quarter')}>quarter</button>
            <button onClick={() => s.setPeriod('custom')}>custom</button>
            <button onClick={() => s.setPeriod('month')}>month</button>
            <button
                onClick={() =>
                    s.setRange({ from: '2026-08-01', to: '2026-08-15' })
                }
            >
                range
            </button>
        </div>
    )
}

// Свежий кэш SWR на каждый рендер: иначе второй тест с тем же ключом
// (endpoint+projectId+period) получил бы данные из общего кэша и фетчер бы не
// вызвался — проверка «параметры дошли до запроса» стала бы ложно-зелёной.
const renderProbe = (url: string) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[url]}>
                <Probe />
            </MemoryRouter>
        </SWRConfig>,
    )

const click = async (label: string) => {
    await act(async () => {
        screen.getByText(label).click()
    })
}

describe('useStatistics — период в URL (TODO-496)', () => {
    beforeEach(() => {
        api.getDashboard.mockResolvedValue({ asOf: 1, scopeLevel: 'all' })
        api.getStatistics.mockResolvedValue({ asOf: 1, scopeLevel: 'all' })
    })

    it('без параметров отдаёт дефолтный период и ничего не пишет в URL', async () => {
        await act(async () => {
            renderProbe('/dashboard')
        })
        expect(screen.getByTestId('period')).toHaveTextContent(DEFAULT_PERIOD)
        expect(screen.getByTestId('search')).toHaveTextContent('')
    })

    it('смена периода уходит в query — host читает его оттуда', async () => {
        renderProbe('/dashboard')
        await click('quarter')
        expect(screen.getByTestId('search')).toHaveTextContent('?period=quarter')
        expect(screen.getByTestId('period')).toHaveTextContent('quarter')
    })

    it('возврат к дефолту убирает параметр (host падает на тот же `month`)', async () => {
        renderProbe('/dashboard?period=quarter')
        await click('month')
        expect(screen.getByTestId('search').textContent).toBe('')
        expect(screen.getByTestId('period')).toHaveTextContent('month')
    })

    it('произвольный диапазон пишется в URL и снимает ST-3', async () => {
        renderProbe('/dashboard')
        await click('custom')
        expect(screen.getByTestId('incomplete')).toHaveTextContent('true')
        await click('range')
        const search = screen.getByTestId('search').textContent ?? ''
        expect(search).toContain('period=custom')
        expect(search).toContain('from=2026-08-01')
        expect(search).toContain('to=2026-08-15')
        expect(screen.getByTestId('incomplete')).toHaveTextContent('false')
    })

    it('уход с custom вычищает from/to — мёртвые параметры в ссылке не висят', async () => {
        renderProbe('/dashboard?period=custom&from=2026-08-01&to=2026-08-15')
        expect(screen.getByTestId('range')).toHaveTextContent(
            '2026-08-01|2026-08-15',
        )
        await click('quarter')
        const search = screen.getByTestId('search').textContent ?? ''
        expect(search).toBe('?period=quarter')
    })

    it('ссылка восстанавливает вид И доносит диапазон до запроса (epoch ms)', async () => {
        await act(async () => {
            renderProbe('/dashboard?period=custom&from=2026-08-01&to=2026-08-15')
        })
        expect(screen.getByTestId('period')).toHaveTextContent('custom')
        expect(api.getDashboard).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 'p1',
                period: 'custom',
                from: new Date('2026-08-01T00:00:00').getTime(),
                to: new Date('2026-08-15T23:59:59.999').getTime(),
            }),
        )
    })

    it('мусор в ?period= не уходит на бэк — читается дефолт', async () => {
        await act(async () => {
            renderProbe('/dashboard?period=;drop')
        })
        expect(screen.getByTestId('period')).toHaveTextContent(DEFAULT_PERIOD)
        expect(api.getDashboard).toHaveBeenCalledWith(
            expect.objectContaining({ period: DEFAULT_PERIOD }),
        )
    })
})

describe('парсеры/писатели query-параметров', () => {
    it('parsePeriodParam: только значения селектора, иначе дефолт', () => {
        expect(parsePeriodParam('week')).toBe('week')
        expect(parsePeriodParam('custom')).toBe('custom')
        expect(parsePeriodParam('year')).toBe(DEFAULT_PERIOD)
        expect(parsePeriodParam(null)).toBe(DEFAULT_PERIOD)
    })

    it('parseRangeParams: только YYYY-MM-DD, частичный диапазон допустим', () => {
        expect(parseRangeParams('2026-08-01', '2026-08-15')).toEqual({
            from: '2026-08-01',
            to: '2026-08-15',
        })
        expect(parseRangeParams('01.08.2026', null)).toEqual(EMPTY_RANGE)
    })

    it('writePeriodParams сохраняет чужие параметры', () => {
        const next = writePeriodParams(
            new URLSearchParams('?tab=x&period=week'),
            'quarter',
            EMPTY_RANGE,
        )
        expect(next.get('tab')).toBe('x')
        expect(next.get('period')).toBe('quarter')
    })

    it('writePeriodParams не пишет from/to вне custom', () => {
        const next = writePeriodParams(new URLSearchParams(), 'week', {
            from: '2026-08-01',
            to: '2026-08-15',
        })
        expect(next.get('from')).toBeNull()
        expect(next.get('to')).toBeNull()
    })

    it('slice: whitelist + дефолт без параметра', () => {
        expect(parseSliceParam('funnel')).toBe('funnel')
        expect(parseSliceParam('by_department')).toBe('by_department')
        expect(parseSliceParam('../etc')).toBe(DEFAULT_SLICE)
        expect(parseSliceParam('order_types')).toBe('order_types')
        expect(writeSliceParam(new URLSearchParams(), 'team').get('slice')).toBe(
            'team',
        )
        expect(
            writeSliceParam(
                new URLSearchParams('?slice=team'),
                DEFAULT_SLICE,
            ).get('slice'),
        ).toBeNull()
    })
})
