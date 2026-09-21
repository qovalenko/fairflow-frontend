import { useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import classNames from '../utils/classNames'
import { SegmentContextProvider } from './context'
import useControllableState from '../hooks/useControllableState'
import type { CommonProps, TypeAttributes } from '../@types/common'
import type { SegmentValue } from './context'
import type { Ref, MutableRefObject } from 'react'

export interface SegmentProps extends CommonProps {
    defaultValue?: SegmentValue
    onChange?: (segmentValue: SegmentValue) => void
    ref?: Ref<HTMLDivElement>
    selectionType?: 'single' | 'multiple'
    size?: TypeAttributes.Size
    value?: SegmentValue
}

const Segment = (props: SegmentProps) => {
    const {
        children,
        className,
        defaultValue,
        onChange = () => {
            // empty callback
        },
        ref,
        selectionType = 'single',
        size,
        value: valueProp,
        ...rest
    } = props

    const [value, setValue] = useControllableState({
        prop: valueProp,
        defaultProp: defaultValue,
        onChange: onChange,
    })

    const onActive = (itemValue: SegmentValue) => {
        setValue(itemValue)
    }

    const onDeactivate = (itemValue: SegmentValue) => {
        if (selectionType === 'single') {
            setValue('')
        }

        if (selectionType === 'multiple') {
            setValue((prevValue = []) => {
                return (prevValue as string[]).filter(
                    (value) => value !== itemValue,
                )
            })
        }
    }

    const segmentValue = useMemo(() => {
        if (selectionType === 'single') {
            if (value && typeof value === 'string') {
                return [value]
            }

            if (value && Array.isArray(value)) {
                return value
            }

            return []
        }

        if (selectionType === 'multiple') {
            return value ? value : []
        }
    }, [selectionType, value])

    const containerRef = useRef<HTMLDivElement>(null)
    const indicatorRef = useRef<HTMLDivElement>(null)
    const prevValueRef = useRef(value)

    const syncIndicator = useCallback(() => {
        const container = containerRef.current
        const indicator = indicatorRef.current
        if (!container || !indicator) return

        const activeEl = container.querySelector<HTMLElement>(
            '.segment-item-active',
        )
        if (!activeEl) {
            indicator.style.opacity = '0'
            return
        }

        const cr = container.getBoundingClientRect()
        const ar = activeEl.getBoundingClientRect()

        indicator.style.left = `${ar.left - cr.left}px`
        indicator.style.width = `${ar.width}px`
        indicator.style.top = `${ar.top - cr.top}px`
        indicator.style.height = `${ar.height}px`
        indicator.style.opacity = '1'
    }, [])

    useLayoutEffect(() => {
        const indicator = indicatorRef.current
        if (!indicator) return
        indicator.style.transition = 'none'
        syncIndicator()
        void indicator.offsetHeight
        indicator.style.transition =
            'left 0.25s ease, width 0.25s ease, top 0.25s ease, height 0.25s ease'
    }, [])

    useEffect(() => {
        if (prevValueRef.current === value) return
        prevValueRef.current = value
        syncIndicator()
    })

    return (
        <SegmentContextProvider
            value={{
                value: segmentValue,
                onActive: onActive,
                onDeactivate: onDeactivate,
                selectionType,
                size,
            }}
        >
            <div
                ref={(el) => {
                    (containerRef as MutableRefObject<HTMLDivElement | null>).current = el
                    if (typeof ref === 'function') ref(el)
                    else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = el
                }}
                className={classNames(
                    'segment',
                    'relative gap-2 bg-gray-100 dark:bg-gray-700',
                    className,
                )}
                {...rest}
            >
                <div
                    ref={indicatorRef}
                    aria-hidden
                    className="absolute rounded-xl bg-white dark:bg-gray-800 shadow-sm pointer-events-none opacity-0"
                />
                {children}
            </div>
        </SegmentContextProvider>
    )
}

export default Segment
