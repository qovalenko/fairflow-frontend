import { PiMinusDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonHorizontalRuleProp = BaseToolButtonProps

const ToolButtonHorizontalRule = ({ editor }: ToolButtonHorizontalRuleProp) => {
    return (
        <ToolButton
            title="Горизонтальная линия"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
            <PiMinusDuotone />
        </ToolButton>
    )
}

export default ToolButtonHorizontalRule
