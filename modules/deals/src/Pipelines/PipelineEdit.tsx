import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiXBold } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiGetPipeline,
    apiCreatePipeline,
    apiUpdatePipeline,
} from '@/services/CrmService'
import type { Pipeline, PipelineAutoTransition } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from '../Deals/dealUtils'
import { qa } from '../qa'

const colorOptions = [
    { value: '#94A3B8', label: 'Серый' },
    { value: '#3B82F6', label: 'Синий' },
    { value: '#8B5CF6', label: 'Фиолетовый' },
    { value: '#F59E0B', label: 'Янтарный' },
    { value: '#F97316', label: 'Оранжевый' },
    { value: '#10B981', label: 'Зелёный' },
    { value: '#EF4444', label: 'Красный' },
]

const kindOptions = [
    { value: 'active', label: 'Активная' },
    { value: 'won', label: 'Успех (Won)' },
    { value: 'lost', label: 'Провал (Lost)' },
]

interface Stage {
    id: string
    name: string
    color: string
    kind: 'active' | 'won' | 'lost'
    rottingDays?: number
}

const newDefaultStages = (): Stage[] => [
    { id: `tmp-${Date.now()}-1`, name: 'Обращение', color: '#94A3B8', kind: 'active' },
    { id: `tmp-${Date.now()}-2`, name: 'Квалификация', color: '#3B82F6', kind: 'active' },
    { id: `tmp-${Date.now()}-3`, name: 'Переговоры', color: '#F59E0B', kind: 'active' },
    { id: `tmp-${Date.now()}-4`, name: 'Закрыто Won', color: '#10B981', kind: 'won' },
    { id: `tmp-${Date.now()}-5`, name: 'Закрыто Lost', color: '#EF4444', kind: 'lost' },
]

/**
 * SCR-DEALS-PIPELINE-EDIT — pipeline constructor (create / edit).
 * Edit loads by :id; save calls Create/UpdatePipeline (FR-MDEAL-20/21/22).
 * Manage-only (`deals:manage`).
 */
const PipelineEdit = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('deals', 'manage')
    const isEditMode = Boolean(id)

    const { data: loaded, isLoading, error } = useSWR(
        isEditMode ? [`/api/v1/pipelines/${id}`, id] : null,
        () => apiGetPipeline<Pipeline>(id!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [name, setName] = useState('')
    const [isDefault, setIsDefault] = useState(false)
    const [stages, setStages] = useState<Stage[]>(isEditMode ? [] : newDefaultStages())
    const [autoTransitions, setAutoTransitions] = useState<PipelineAutoTransition[]>([])
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    // Hydrate the form once the pipeline loads (edit mode).
    useEffect(() => {
        if (loaded) {
            setName(loaded.name)
            setIsDefault(loaded.isDefault)
            setStages(
                loaded.stages.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    kind: ((s as { kind?: Stage['kind'] }).kind ?? 'active') as Stage['kind'],
                    rottingDays: (s as { rottingDays?: number }).rottingDays,
                })),
            )
            setAutoTransitions(
                (loaded.autoTransitions ?? []).map((t) => ({
                    fromStageId: t.fromStageId,
                    toStageId: t.toStageId,
                })),
            )
        }
    }, [loaded])

    const markDirty = () => setDirty(true)

    const addStage = () =>
        setStages((prev) => {
            markDirty()
            // Insert before any terminal (won/lost) stages.
            const finalIdx = prev.findIndex((s) => s.kind !== 'active')
            const insertAt = finalIdx === -1 ? prev.length : finalIdx
            const stage: Stage = {
                id: `tmp-${Date.now()}`,
                name: 'Новая стадия',
                color: '#94A3B8',
                kind: 'active',
            }
            return [...prev.slice(0, insertAt), stage, ...prev.slice(insertAt)]
        })

    const removeStage = (stageId: string) =>
        setStages((prev) => {
            markDirty()
            return prev.filter((s) => s.id !== stageId)
        })

    const updateStage = (stageId: string, updates: Partial<Stage>) =>
        setStages((prev) => {
            markDirty()
            return prev.map((s) => (s.id === stageId ? { ...s, ...updates } : s))
        })

    const addAutoTransition = () => {
        const active = stages.filter((s) => s.kind === 'active')
        if (active.length < 2) return
        markDirty()
        setAutoTransitions((prev) => [
            ...prev,
            { fromStageId: active[0].id, toStageId: active[1].id },
        ])
    }

    const updateAutoTransition = (
        index: number,
        patch: Partial<PipelineAutoTransition>,
    ) => {
        markDirty()
        setAutoTransitions((prev) =>
            prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        )
    }

    const removeAutoTransition = (index: number) => {
        markDirty()
        setAutoTransitions((prev) => prev.filter((_, i) => i !== index))
    }

    const stageOptions = stages
        .filter((s) => s.kind === 'active')
        .map((s) => ({ value: s.id, label: s.name }))

    const handleSave = async () => {
        if (!name.trim()) {
            notifyError('Укажите название воронки')
            return
        }
        setSaving(true)
        const payload = {
            name: name.trim(),
            isDefault,
            stages: stages.map((s, order) => ({
                // Keep client ids (including tmp-*) so auto-transitions stay
                // wired to the same stage ids the backend persists (FR-DEALS-220).
                id: s.id,
                name: s.name,
                color: s.color,
                kind: s.kind,
                order,
                ...(s.rottingDays != null ? { rottingDays: s.rottingDays } : {}),
            })),
            autoTransitions: autoTransitions.map((t) => ({
                fromStageId: t.fromStageId,
                toStageId: t.toStageId,
            })),
        }
        try {
            if (isEditMode) {
                await apiUpdatePipeline<Pipeline>(id!, payload)
            } else {
                await apiCreatePipeline<Pipeline>(payload)
            }
            notifySuccess('Воронка сохранена')
            setDirty(false)
            navigate(`/deals/pipelines`)
        } catch (err) {
            // 422 (cycle/empty name), 409 (orphaning stage) — FR-MDEAL-21/22.
            notifyError(extractError(err, 'Не удалось сохранить воронку'))
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Продолжить?')) return
        navigate(-1)
    }

    if (isEditMode && isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    if (isEditMode && (error || !loaded)) {
        return (
            <Container>
                <div className="text-center py-10" {...qa('deals.pipelines.edit.notFound')}>
                    <p className="text-gray-500">Воронка не найдена</p>
                    <Button
                        variant="solid"
                        color="primary"
                        className="mt-4"
                        onClick={() => navigate(`/deals/pipelines`)}
                    >
                        К списку воронок
                    </Button>
                </div>
            </Container>
        )
    }

    return (
        <Container {...qa('deals.pipelines.edit.root')}>
            <div className="max-w-2xl">
                <AdaptiveCard>
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">
                            {isEditMode ? 'Редактирование воронки' : 'Новая воронка'}
                        </h2>

                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Название воронки <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => {
                                    markDirty()
                                    setName(e.target.value)
                                }}
                                placeholder="Название воронки"
                                disabled={!canManage}
                                {...qa('deals.pipelines.edit.name')}
                            />
                        </div>

                        <div>
                            <Checkbox
                                checked={isDefault}
                                disabled={!canManage}
                                onChange={(checked) => {
                                    markDirty()
                                    setIsDefault(checked)
                                }}
                            >
                                Воронка по умолчанию
                            </Checkbox>
                        </div>

                        <div className="pt-4 border-t">
                            <h3 className="font-semibold mb-3">Стадии</h3>
                            <div className="space-y-2">
                                {stages.map((stage) => (
                                    <div
                                        key={stage.id}
                                        className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                                        {...qa('deals.pipelines.edit.stage', { stage: stage.id })}
                                    >
                                        <span
                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: stage.color }}
                                        />
                                        <Input
                                            value={stage.name}
                                            onChange={(e) =>
                                                updateStage(stage.id, { name: e.target.value })
                                            }
                                            className="flex-1"
                                            disabled={!canManage}
                                        />
                                        <Select<{ value: string; label: string }>
                                            options={colorOptions}
                                            value={colorOptions.find((o) => o.value === stage.color) ?? null}
                                            onChange={(opt) =>
                                                updateStage(stage.id, { color: opt?.value ?? '#94A3B8' })
                                            }
                                            className="w-32"
                                            isDisabled={!canManage}
                                        />
                                        <Select<{ value: string; label: string }>
                                            options={kindOptions}
                                            value={kindOptions.find((o) => o.value === stage.kind) ?? null}
                                            onChange={(opt) =>
                                                updateStage(stage.id, {
                                                    kind: (opt?.value ?? 'active') as Stage['kind'],
                                                })
                                            }
                                            className="w-36"
                                            isDisabled={!canManage}
                                        />
                                        {canManage && stage.kind === 'active' && (
                                            <button
                                                type="button"
                                                onClick={() => removeStage(stage.id)}
                                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-500"
                                                aria-label="Удалить стадию"
                                                {...qa('deals.pipelines.edit.removeStage', { stage: stage.id })}
                                            >
                                                <PiXBold className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {canManage && (
                                <Button
                                    variant="plain"
                                    className="mt-3"
                                    onClick={addStage}
                                    {...qa('deals.pipelines.edit.addStage')}
                                >
                                    + Добавить стадию
                                </Button>
                            )}
                        </div>

                        {canManage && (
                            <div className="pt-4 border-t">
                                <h3 className="font-semibold mb-1">Авто-переходы стадий</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                    При входе сделки на стадию «из» она автоматически перейдёт на стадию «в».
                                    Циклические правила отклоняются при сохранении (FR-DEALS-220).
                                </p>
                                <div className="space-y-2">
                                    {autoTransitions.map((rule, index) => (
                                        <div
                                            key={`${rule.fromStageId}-${rule.toStageId}-${index}`}
                                            className="flex flex-wrap items-center gap-2"
                                            {...qa('deals.pipelines.edit.autoTransition', { index: String(index) })}
                                        >
                                            <Select
                                                className="min-w-[10rem] flex-1"
                                                options={stageOptions}
                                                value={
                                                    stageOptions.find((o) => o.value === rule.fromStageId) ??
                                                    null
                                                }
                                                onChange={(opt) =>
                                                    updateAutoTransition(index, {
                                                        fromStageId: opt?.value ?? '',
                                                    })
                                                }
                                                placeholder="Из стадии"
                                            />
                                            <span className="text-gray-500">→</span>
                                            <Select
                                                className="min-w-[10rem] flex-1"
                                                options={stageOptions}
                                                value={
                                                    stageOptions.find((o) => o.value === rule.toStageId) ??
                                                    null
                                                }
                                                onChange={(opt) =>
                                                    updateAutoTransition(index, {
                                                        toStageId: opt?.value ?? '',
                                                    })
                                                }
                                                placeholder="В стадию"
                                            />
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                className="text-red-500"
                                                onClick={() => removeAutoTransition(index)}
                                                {...qa('deals.pipelines.edit.removeAutoTransition', { index: String(index) })}
                                            >
                                                Удалить
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    variant="plain"
                                    className="mt-3"
                                    disabled={stageOptions.length < 2}
                                    onClick={addAutoTransition}
                                    {...qa('deals.pipelines.edit.autoTransition.add')}
                                >
                                    + Добавить правило
                                </Button>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-6">
                            <Button variant="plain" onClick={handleCancel}>
                                Отмена
                            </Button>
                            {canManage && (
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={saving}
                                    onClick={handleSave}
                                    {...qa('deals.pipelines.edit.save')}
                                >
                                    Сохранить
                                </Button>
                            )}
                        </div>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default PipelineEdit
