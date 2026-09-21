import Drawer from '@/components/ui/Drawer'
import Slot from '@/components/shared/Slot'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import { qa } from '@/shared/qa'

/**
 * FR-PROFILE-320 / `global.drawer.entity`: host orchestrates the global entity
 * drawer; modules contribute panels via manifest mountPoints.
 */
export default function GlobalEntityDrawer() {
    const { entityType, entityId, close } = useGlobalEntityDrawer()
    const isOpen = Boolean(entityType && entityId)

    return (
        <Drawer
            isOpen={isOpen}
            onClose={() => close()}
            width={480}
            title={entityType === 'user' ? 'Профиль коллеги' : 'Карточка'}
            bodyClass="p-0"
            {...qa('host.globalDrawer.root')}
        >
            {isOpen && (
                <Slot
                    id="global.drawer.entity"
                    context={{ entityType, entityId }}
                    className="p-5"
                    pending={null}
                />
            )}
        </Drawer>
    )
}
