import { PiListBulletsDuotone } from 'react-icons/pi'
import ToolButton from './ToolButton'
import type { BaseToolButtonProps } from './types'

type ToolButtonBulletListProp = BaseToolButtonProps

const ToolButtonBulletList = ({ editor }: ToolButtonBulletListProp) => {
    return (
        <ToolButton
            title="Маркированный список"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
            <PiListBulletsDuotone />
        </ToolButton>
    )
}

export default ToolButtonBulletList
