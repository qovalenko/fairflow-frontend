import {
    PiFileTextDuotone,
    PiCopyDuotone,
    PiBankDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import dayjs from 'dayjs'
import type { Company } from '@/@types/crm'

export interface CompanyRequisitesWidgetProps {
    company: Company
    onCopy?: () => void
}

const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {children}
    </div>
)

const CompanyRequisitesWidget = ({
    company,
    onCopy,
}: CompanyRequisitesWidgetProps) => {
    const hasRequisites =
        company.ogrn ||
        company.kpp ||
        company.legalAddress ||
        company.actualAddress ||
        company.bankName ||
        company.bik ||
        company.correspondentAccount ||
        company.settlementAccount

    if (!hasRequisites) return null

    return (
        <Card
            className="w-full max-w-md flex flex-col border border-gray-200 dark:border-gray-700"
            bodyClass=""
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiFileTextDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Реквизиты</h4>
                    </div>
                ),
                extra:
                    onCopy && (
                        <Tooltip title="Копировать реквизиты">
                            <button
                                type="button"
                                onClick={onCopy}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                aria-label="Копировать реквизиты"
                            >
                                <PiCopyDuotone className="w-4 h-4" />
                            </button>
                        </Tooltip>
                    ),
                bordered: true,
            }}
        >
            <div className="w-full space-y-4">
                {(company.ogrn || company.kpp) && (
                    <div className="grid grid-cols-2 gap-4">
                        {company.ogrn && (
                            <div>
                                <Label>ОГРН</Label>
                                <div className="font-medium">{company.ogrn}</div>
                            </div>
                        )}
                        {company.kpp && (
                            <div>
                                <Label>КПП</Label>
                                <div className="font-medium">{company.kpp}</div>
                            </div>
                        )}
                    </div>
                )}

                {company.legalAddress && (
                    <div>
                        <Label>Юридический адрес</Label>
                        <div className="font-medium">{company.legalAddress}</div>
                    </div>
                )}

                {company.actualAddress && (
                    <div>
                        <Label>Фактический адрес</Label>
                        <div className="font-medium">{company.actualAddress}</div>
                    </div>
                )}

                {(company.bankName || company.bik || company.correspondentAccount || company.settlementAccount) && (
                    <>
                        <div className="border-t border-gray-200 dark:border-gray-600 pt-4" />
                        {company.bankName && (
                            <div className="flex items-center gap-2 mb-3">
                                <PiBankDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {company.bankName}
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            {company.bik && (
                                <div className="flex justify-between items-baseline gap-4">
                                    <Label>БИК</Label>
                                    <div className="font-medium tabular-nums">{company.bik}</div>
                                </div>
                            )}
                            {company.correspondentAccount && (
                                <div className="flex justify-between items-baseline gap-4">
                                    <Label>К/с</Label>
                                    <div className="font-medium tabular-nums">{company.correspondentAccount}</div>
                                </div>
                            )}
                            {company.settlementAccount && (
                                <div className="flex justify-between items-baseline gap-4">
                                    <Label>Р/с</Label>
                                    <div className="font-medium tabular-nums">{company.settlementAccount}</div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 text-right">
                    Дата создания: {dayjs.unix(company.createdAt).format('DD.MM.YYYY HH:mm')}
                </div>
            </div>
        </Card>
    )
}

export default CompanyRequisitesWidget
