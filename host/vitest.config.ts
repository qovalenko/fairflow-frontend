/**
 * Host test config. Delegates to the shared factory (testing/vitest.shared.ts)
 * so host and remotes share one jsdom + RTL pipeline. See testing/README-TESTING.md.
 *
 * Дополнение: заглушка федеративных virtual-модулей `remote<Name>/<Expose>`.
 * Их создаёт `@originjs/vite-plugin-federation` только в реальной сборке, а под
 * vitest импорт host-кода, который на них ссылается (`src/utils/loadRemoteComponent.ts`
 * — реестр slot-контрибуций и экранов настроек модулей), падает на стадии
 * import-analysis. Заглушка позволяет тестировать САМ реестр (какие пары
 * `<moduleId>::<expose>` смонтированы), не загружая настоящие бандлы. Тот же
 * приём, что в `modules/search/vitest.config.ts`.
 */
import type { Plugin, UserConfig } from 'vite'
import { createVitestConfig } from './testing/vitest.shared'

const REMOTE_ID = /^remote[A-Z][A-Za-z0-9]*\//

function stubFederationRemotes(): Plugin {
    return {
        name: 'stub-federation-remotes',
        enforce: 'pre',
        resolveId(id: string) {
            return REMOTE_ID.test(id) ? `\0stub:${id}` : null
        },
        load(id: string) {
            return id.startsWith('\0stub:')
                ? 'export default function RemoteStub() { return null }'
                : null
        },
    }
}

const base = createVitestConfig() as UserConfig

export default {
    ...base,
    plugins: [stubFederationRemotes(), ...(base.plugins ?? [])],
} as UserConfig
