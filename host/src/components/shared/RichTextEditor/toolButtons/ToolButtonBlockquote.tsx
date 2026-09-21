import { PiQuotesDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonBlockquoteProp = BaseToolButtonProps

const ToolButtonBlockquote = ({ editor }: ToolButtonBlockquoteProp) => {
    return (
        <ToolButton
            title="Цитата"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
            <PiQuotesDuotone />
        </ToolButton>
    )
}

export default ToolButtonBlockquote
