import { useState } from 'react'
import { Input, InputProps } from '@/components/ui/Input'
import { PiEyeSlashDuotone, PiEyeDuotone } from 'react-icons/pi'
import type { MouseEvent, Ref } from 'react'

interface PasswordInputProps extends InputProps {
    onVisibleChange?: (visible: boolean) => void
    ref?: Ref<HTMLInputElement>
}

const PasswordInput = (props: PasswordInputProps) => {
    const { onVisibleChange, ref, ...rest } = props

    const [pwInputType, setPwInputType] = useState('password')

    const onPasswordVisibleClick = (e: MouseEvent<HTMLSpanElement>) => {
        e.preventDefault()
        const nextValue = pwInputType === 'password' ? 'text' : 'password'
        setPwInputType(nextValue)
        onVisibleChange?.(nextValue === 'text')
    }

    return (
        <Input
            {...rest}
            ref={ref}
            type={pwInputType}
            suffix={
                <span
                    className="cursor-pointer select-none text-xl text-gray-400 hover:text-gray-300"
                    role="button"
                    onClick={onPasswordVisibleClick}
                >
                    {pwInputType === 'password' ? (
                        <PiEyeSlashDuotone />
                    ) : (
                        <PiEyeDuotone />
                    )}
                </span>
            }
        />
    )
}

export default PasswordInput
