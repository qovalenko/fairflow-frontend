import { PiCodeDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonCodeProp = BaseToolButtonProps

const ToolButtonCode = ({ editor }: ToolButtonCodeProp) => {
    return (
        <ToolButton
            title="Код"
            disabled={!editor.can().chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
        >
            <PiCodeDuotone />
        </ToolButton>
    )
}

export default ToolButtonCode
