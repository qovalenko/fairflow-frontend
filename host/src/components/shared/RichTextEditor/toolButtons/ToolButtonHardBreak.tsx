import { PiLineVerticalDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonHardBreakProp = BaseToolButtonProps

const ToolButtonHardBreak = ({ editor }: ToolButtonHardBreakProp) => {
    return (
        <ToolButton
            title="Перенос строки"
            onClick={() => editor.chain().focus().setHardBreak().run()}
        >
            <PiLineVerticalDuotone />
        </ToolButton>
    )
}

export default ToolButtonHardBreak
