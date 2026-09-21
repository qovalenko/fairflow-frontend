import { PiListNumbersDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonOrderedListProp = BaseToolButtonProps

const ToolButtonOrderedList = ({ editor }: ToolButtonOrderedListProp) => {
    return (
        <ToolButton
            title="Нумерованный список"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
            <PiListNumbersDuotone />
        </ToolButton>
    )
}

export default ToolButtonOrderedList
