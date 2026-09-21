import { Container } from '@fairflow/shared-ui'
import SearchResults from './SearchResults'

/**
 * SearchModule — главный вид-роутер модуля поиска (federated remote `remoteSearch`).
 *
 * Разделение экранов области SEARCH (TODO-258):
 *  - `SCR-SEARCH-DIALOG` (overlay в шапке) — chrome ОБОЛОЧКИ, живёт в хосте
 *    (`host/src/components/template/Search.tsx`). Слот `shell.header.action`
 *    объявлен `host-only`, вклад business-модуля в него отвергается контрактом,
 *    поэтому модуль его и не экспонирует.
 *  - `SCR-SEARCH-SETTINGS` — `SearchSettingsTab`, штатно монтируется в слот
 *    `project.settings.tab` (`open` после OQ-MODULE-130, гейт `project:manage`);
 *    при несмонтированном вкладе host поднимает его сам (`ModuleSettingsPanel`).
 *  - `SCR-SEARCH-RESULTS` (`/p/:pid/search?q=…`) — этот вид, обычный маршрут
 *    модуля.
 */
const SearchModule = () => (
    <Container>
        <SearchResults />
    </Container>
)

export default SearchModule
