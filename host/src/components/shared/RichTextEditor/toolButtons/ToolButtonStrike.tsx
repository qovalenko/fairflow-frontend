import { PiTextStrikethroughDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonStrikeProp = BaseToolButtonProps

const ToolButtonStrike = ({ editor }: ToolButtonStrikeProp) => {
    return (
        <ToolButton
            title="Зачёркнутый"
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
        >
            <PiTextStrikethroughDuotone />
        </ToolButton>
    )
}

export default ToolButtonStrike
