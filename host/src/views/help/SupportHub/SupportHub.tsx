import { useSearchParams } from 'react-router'
import Container from '@/components/shared/Container'
import TopSection from './components/TopSection'
import Overview from './components/Overview'
import SearchResults from './components/SearchResults'

const SupportHub = () => {
    const [searchParams] = useSearchParams()
    const query = searchParams.get('q')?.trim() ?? ''

    return (
        <>
            <TopSection initialQuery={query} />
            <div className="py-8">
                <Container>
                    <div className="mx-auto max-w-[1000px] px-4">
                        {query ? <SearchResults query={query} /> : <Overview />}
                    </div>
                </Container>
            </div>
        </>
    )
}

export default SupportHub
