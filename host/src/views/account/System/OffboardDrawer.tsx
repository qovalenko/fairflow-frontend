import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    PiWarningDuotone,
    PiArrowClockwiseDuotone,
    PiCheckCircleDuotone,
    PiQuestion,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Drawer from '@/components/ui/Drawer'
import Select from '@/components/ui/Select'
import Tooltip from '@/components/ui/Tooltip'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiGetOffboardPreview,
    apiOffboardEmployee,
    apiGetEmployees,
    type OffboardPreview,
    type OffboardResult,
    type OrgEmployee,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

type Step = 'preview' | 'result'

/** Box-паттерн: подпись поля скрыта, значение — placeholder, рядом «?»-тултип. */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

/**
 * SCR-MORG-EMPLOYEE-OFFBOARD — мастер увольнения (каскад §3.4, FR-MORG-19/25/27/28).
 * Шаг 1: превью последствий (проекты теряемого доступа + записи на
 * переназначение). Шаг 2: результат + eventual-пометка.
 *
 * Гейтинг — на стороне вызова (EMPLOYEES: `employees:delete`, !isOwner).
 * Владельца уволить нельзя (cannot_remove_owner, FR-MORG-19) — кнопка disabled.
 *
 * Бэк превью: GET …/employees/:userId/offboard/preview (v1-data-bff → control
 * PreviewOffboard, @RequireOrgRole('manage')). Отдаёт теряемые ОРГ-проекты и
 * owner-guard; счётчики записей на переназначение НЕ считаются (живут в Mongo
 * CRM-доменах) → preview.reassign пуст, partial=true.
 *
 * Мутация: POST …/offboard (v1-data-bff → control DeactivateEmployee,
 * @RequireOrgRole('manage')). Каскад в control (BX-OFFB): soft-delete + отзыв
 * ВСЕГО проектного доступа (manual+binding ProjectMember, project-scoped
 * RoleAssignment/PermissionGrant) + отзыв живых auth-сессий (fail-soft). Owner
 * защищён (cannot_remove_owner).
 *
 * BX-OFFB-2: записи уволенного (сделки/контакты/продажи/активности в Mongo
 * CRM-доменах) переназначаются активному ответственному через шину
 * (control.member.offboarded → consumer'ы доменов) — eventual. Здесь выбирается
 * ПОЛУЧАТЕЛЬ (пикер активных сотрудников, box-паттерн placeholder+«?»; пусто →
 * бэк берёт действующего админа); ответ processing=true, счётчики придут не
 * синхронно (переназначение идёт в фоне).
 */
const OffboardDrawer = ({
    isOpen,
    employee,
    onClose,
    onDone,
}: {
    isOpen: boolean
    employee: OrgEmployee | null
    onClose: () => void
    onDone: () => void
}) => {
    const [step, setStep] = useState<Step>('preview')
    const [preview, setPreview] = useState<OffboardPreview | null>(null)
    const [result, setResult] = useState<OffboardResult | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [reassignToUserId, setReassignToUserId] = useState('')

    const userId = employee?.userId

    const load = useCallback(async () => {
        if (!userId) return
        setIsLoading(true)
        setError(null)
        try {
            // Превью + список сотрудников (для пикера получателя) — параллельно.
            const [res, emps] = await Promise.all([
                apiGetOffboardPreview(userId),
                apiGetEmployees().catch(() => [] as OrgEmployee[]),
            ])
            setPreview(res)
            setEmployees(emps)
        } catch (e) {
            console.error('Offboard preview failed:', e)
            setError('Не удалось рассчитать последствия увольнения.')
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    useEffect(() => {
        if (isOpen && userId) {
            setStep('preview')
            setResult(null)
            setPreview(null)
            setReassignToUserId('')
            load()
        }
    }, [isOpen, userId, load])

    // Получатели записей — активные сотрудники, кроме самого увольняемого.
    const reassignOptions = useMemo(
        () =>
            employees
                .filter((e) => e.isActive !== false && e.userId !== userId)
                .map((e) => ({
                    value: e.userId,
                    label: e.name || e.email || e.userId,
                })),
        [employees, userId],
    )

    const handleOffboard = async () => {
        if (!userId) return
        setIsSubmitting(true)
        try {
            const res = await apiOffboardEmployee(userId, reassignToUserId)
            setResult(res)
            setStep('result')
        } catch (e) {
            const status = (e as { response?: { status?: number } })?.response
                ?.status
            const msg =
                status === 409
                    ? 'Владельца организации нельзя уволить.'
                    : 'Не удалось уволить сотрудника.'
            toast.push(
                <Notification title="Не удалось" type="danger">
                    {msg}
                </Notification>,
            )
            console.error('Offboard failed:', e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const reassignName = reassignOptions.find(
        (o) => o.value === reassignToUserId,
    )?.label

    return (
        <Drawer
            isOpen={isOpen}
            title={`Увольнение: ${employee?.name ?? ''}`}
            width={460}
            onClose={onClose}
            {...qa('host.settings.offboard.drawer', { user: userId ?? '' })}
        >
            {/* ST-1 Loading превью */}
            {step === 'preview' && isLoading && (
                <div className="flex justify-center py-12">
                    <Spinner size={40} />
                </div>
            )}

            {/* ST-6 Error превью + retry */}
            {step === 'preview' && error && !isLoading && (
                <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        {error}
                    </p>
                    <Button
                        size="sm"
                        variant="default"
                        icon={<PiArrowClockwiseDuotone />}
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            )}

            {step === 'preview' && preview && !isLoading && !error && (
                <div className="space-y-4">
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                        <PiWarningDuotone className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>
                            Увольнение немедленно закрывает доступ. Действие
                            необратимо (soft — сотрудник остаётся в списке
                            уволенных).
                        </span>
                    </div>

                    {preview.partial && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Точное число записей на переназначение заранее не
                            рассчитывается — переназначение выполнится в фоне
                            после увольнения.
                        </p>
                    )}

                    {/* EL-OFF-1: проекты теряемого доступа */}
                    <div>
                        <h4 className="text-sm font-semibold mb-1">
                            Теряется доступ к проектам ({preview.projects.length})
                        </h4>
                        {preview.projects.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                Нет проектов.
                            </p>
                        ) : (
                            <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-0.5">
                                {preview.projects.map((p) => (
                                    <li
                                        key={p.projectId}
                                        {...qa('host.settings.offboard.project', { project: p.projectId })}
                                    >
                                        {p.projectName ?? p.projectId}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* EL-OFF-2 (BX-OFFB-2): получатель записей уволенного.
                        Box-паттерн — без подписи, placeholder + «?»-тултип. */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-1">
                            <HelpIcon title="Сделки, контакты, продажи и активности уволенного будут переназначены выбранному активному сотруднику. Пусто — записи получит текущий администратор. Переназначение выполняется в фоне." />
                        </div>
                        <Select
                            isClearable
                            size="sm"
                            placeholder="Кому передать записи (по умолчанию — вы)"
                            value={
                                reassignOptions.find(
                                    (o) => o.value === reassignToUserId,
                                ) ?? null
                            }
                            options={reassignOptions}
                            onChange={(opt) =>
                                setReassignToUserId(
                                    (opt as { value?: string } | null)?.value ??
                                        '',
                                )
                            }
                            {...qa('host.settings.offboard.reassignTo')}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Записи переназначаются в фоне после увольнения
                            (eventual).
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="plain" onClick={onClose}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="danger"
                            loading={isSubmitting}
                            disabled={preview.isOwner}
                            title={
                                preview.isOwner
                                    ? 'Владельца организации нельзя уволить'
                                    : undefined
                            }
                            onClick={handleOffboard}
                        >
                            Уволить
                        </Button>
                    </div>
                </div>
            )}

            {/* ST-29 Success / ST-26 Pending каскада */}
            {step === 'result' && result && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <PiCheckCircleDuotone className="w-6 h-6" />
                        <span className="font-semibold">Сотрудник уволен</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Доступ закрыт, сессии отозваны. Записи уволенного
                        переназначаются
                        {reassignName
                            ? ` сотруднику «${reassignName}»`
                            : ' текущему администратору'}{' '}
                        в фоне — могут обновляться с задержкой (eventual).
                    </p>
                    {(result.reassigned > 0 || result.unassigned > 0) && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                            <div>Переназначено: {result.reassigned}</div>
                            <div>
                                Требует переназначения: {result.unassigned}
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end pt-4">
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={() => {
                                onClose()
                                onDone()
                            }}
                        >
                            Готово
                        </Button>
                    </div>
                </div>
            )}
        </Drawer>
    )
}

export default OffboardDrawer
