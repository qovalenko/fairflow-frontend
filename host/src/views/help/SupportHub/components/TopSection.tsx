import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { PiMagnifyingGlassDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Container from '@/components/shared/Container'

type Props = {
    /** Текущий поисковый запрос (из `?q=`), чтобы предзаполнить поле. */
    initialQuery?: string
}

const TopSection = ({ initialQuery = '' }: Props) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const navigate = useNavigate()

    const handleSearch = () => {
        const value = inputRef.current?.value?.trim()
        if (value) {
            navigate(`/help?q=${encodeURIComponent(value)}`)
        } else {
            navigate('/help')
        }
    }

    return (
        <section className="flex flex-col justify-center min-h-[280px] bg-gradient-to-br from-cyan-100 via-violet-100 to-fuchsia-100 dark:from-cyan-900/30 dark:via-violet-900/30 dark:to-fuchsia-900/30">
            <Container className="flex flex-col items-center px-4">
                <div className="mb-6 flex flex-col items-center">
                    <h2 className="mb-2 text-2xl font-bold text-center heading-text">
                        Центр поддержки
                    </h2>
                    <p className="max-w-[400px] text-sm text-gray-600 dark:text-gray-300 text-center">
                        Поиск ответов, частые вопросы и материалы в одном месте.
                    </p>
                </div>
                <div className="border border-gray-200 dark:border-gray-600 rounded-xl min-h-[50px] px-3 flex flex-col bg-white dark:bg-gray-800 max-w-[800px] w-full shadow-sm">
                    <div className="flex items-center gap-2 w-full h-14">
                        <input
                            ref={inputRef}
                            type="search"
                            defaultValue={initialQuery}
                            className="flex-1 h-full placeholder:text-gray-400 bg-transparent focus:outline-none text-sm font-medium"
                            placeholder="Поиск по статьям..."
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSearch()
                            }}
                        />
                        <Button
                            size="sm"
                            shape="circle"
                            variant="solid"
                            icon={
                                <PiMagnifyingGlassDuotone className="w-5 h-5" />
                            }
                            aria-label="Искать"
                            onClick={handleSearch}
                        />
                    </div>
                </div>
            </Container>
        </section>
    )
}

export default TopSection
