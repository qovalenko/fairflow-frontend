import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_SEGMENT_ROUTE_DELAY = 180

const useSegmentRouteTransition = (
    currentValue: string,
    onNavigate: (value: string) => void,
    delay = DEFAULT_SEGMENT_ROUTE_DELAY,
) => {
    const [displayValue, setDisplayValue] = useState(currentValue)
    const timeoutRef = useRef<number | null>(null)

    const clearPendingNavigation = useCallback(() => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        setDisplayValue(currentValue)
    }, [currentValue])

    useEffect(() => clearPendingNavigation, [clearPendingNavigation])

    const handleSegmentChange = useCallback(
        (nextValue: string) => {
            if (nextValue === currentValue) {
                clearPendingNavigation()
                setDisplayValue(nextValue)
                return
            }

            setDisplayValue(nextValue)
            clearPendingNavigation()

            timeoutRef.current = window.setTimeout(() => {
                onNavigate(nextValue)
                timeoutRef.current = null
            }, delay)
        },
        [clearPendingNavigation, currentValue, delay, onNavigate],
    )

    return [displayValue, handleSegmentChange] as const
}

export default useSegmentRouteTransition
