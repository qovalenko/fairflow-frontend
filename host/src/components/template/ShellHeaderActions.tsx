import Slot from '@/components/shared/Slot'

/**
 * SCR-SHELL-CHROME-HEADER — mount-point слота `shell.header.action` (host-only).
 * Вкладчики приходят из манифестов system-модулей (`search`, `notifications`…)
 * и резолвятся в host-local chrome (`Search`, `NotificationDropdown`).
 */
const ShellHeaderActions = () => (
    <div>
        <Slot id="shell.header.action" className="flex items-center gap-1" pending={null} />
    </div>
)

export default ShellHeaderActions
