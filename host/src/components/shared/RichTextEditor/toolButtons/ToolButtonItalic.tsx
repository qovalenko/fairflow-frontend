import { PiTextItalicDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonItalicProp = BaseToolButtonProps

const ToolButtonItalic = ({ editor }: ToolButtonItalicProp) => {
    return (
        <ToolButton
            title="Курсив"
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
        >
            <PiTextItalicDuotone />
        </ToolButton>
    )
}

export default ToolButtonItalic
