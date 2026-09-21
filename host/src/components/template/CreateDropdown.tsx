import { useMemo, useState } from 'react'
import classNames from 'classnames'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Dropdown from '@/components/ui/Dropdown'
import useResponsive from '@/utils/hooks/useResponsive'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import useDrawerEntities from '@/utils/hooks/useDrawerEntities'
import usePermission from '@/utils/hooks/usePermission'
import { qa } from '@/shared/qa'
import { PiPlusDuotone } from 'react-icons/pi'
import EntityCreateDrawer, { type EntityCreateType } from './EntityCreateDrawer'

const _CreateDropdown = ({ className }: { className?: string }) => {
    const { larger } = useResponsive()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const can = usePermission()
    const { enabledCards } = usePlatformModules()
    const enabledModules = useMemo(
        () => enabledCards.map((c) => c.id),
        [enabledCards],
    )
    const drawerEntities = useDrawerEntities()
    const [drawerEntity, setDrawerEntity] = useState<EntityCreateType | null>(null)

    const visibleItems = useMemo(
        () =>
            drawerEntities.filter((item) => {
                if (!enabledModules.includes(item.moduleKey)) return false
                if (!item.requires) return true
                const [subject, action] = item.requires.split(':')
                return subject && action ? can(subject, action) : true
            }),
        [drawerEntities, enabledModules, can],
    )

    const handleSelect = (item: (typeof visibleItems)[0]) => {
        if (!pid) {
            navigate('/account/projects')
            return
        }
        if (item.entityType) {
            setDrawerEntity(item.entityType)
        } else {
            navigate(`/${item.path}`)
        }
    }

    if (visibleItems.length === 0) return null

    return (
        <>
            <Dropdown
                renderTitle={
                    <div
                        className={classNames('text-2xl', className)}
                        {...qa('host.create.dropdown')}
                        {...qa('host.createDropdown.trigger')}
                        {...qa('host.globalCreate.trigger')}
                        {...qa('host.create.open')}
                    >
                        <PiPlusDuotone />
                    </div>
                }
                menuClass="min-w-[200px]"
                placement={larger.md ? 'bottom-start' : 'bottom'}
            >
                {visibleItems.map((item) => (
                    <Dropdown.Item
                        key={item.key}
                        eventKey={item.key}
                        className="flex items-center gap-2 cursor-pointer"
                        {...qa('host.create.item', { entity: item.key })}
                        {...qa('host.createDropdown.item', {
                            entity: item.entityType ?? item.path,
                        })}
                        {...qa('host.globalCreate.item', { entity: item.key })}
                        {...qa(`host.create.${item.entityType ?? item.key}`)}
                        onClick={() => handleSelect(item)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Dropdown.Item>
                ))}
            </Dropdown>
            {drawerEntity && (
                <EntityCreateDrawer
                    entityType={drawerEntity}
                    isOpen={!!drawerEntity}
                    onClose={() => setDrawerEntity(null)}
                    onSuccess={() => setDrawerEntity(null)}
                />
            )}
        </>
    )
}

const CreateDropdown = withHeaderItem(_CreateDropdown)

export default CreateDropdown
