import { useState } from 'react'
import { PiCopyDuotone, PiDownloadSimpleDuotone, PiCheckBold } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import { notify } from '@/utils/notify'
import { qa } from '@/shared/qa'

interface BackupCodesPanelProps {
    codes: string[]
}

/**
 * One-time display of 2FA backup codes (BR-MPROF-11). Shared by 2FA setup
 * and backup-code regeneration screens — codes are shown exactly once.
 */
const BackupCodesPanel = ({ codes }: BackupCodesPanelProps) => {
    const [copied, setCopied] = useState(false)

    const asText = codes.join('\n')

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(asText)
            setCopied(true)
            notify('Коды скопированы', 'success')
            setTimeout(() => setCopied(false), 2000)
        } catch {
            notify('Не удалось скопировать', 'danger')
        }
    }

    const handleDownload = () => {
        const blob = new Blob([asText], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'fairflow-backup-codes.txt'
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-4" {...qa('host.backupCodes.panel')}>
            <Alert showIcon type="warning">
                Сохраните эти коды в надёжном месте. Они показываются только один
                раз и заменяют предыдущие.
            </Alert>
            <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 font-mono text-sm">
                {codes.map((code) => (
                    <div key={code} className="py-1 tracking-wider">
                        {code}
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <Button
                    variant="default"
                    icon={copied ? <PiCheckBold /> : <PiCopyDuotone />}
                    onClick={handleCopy}
                >
                    {copied ? 'Скопировано' : 'Скопировать'}
                </Button>
                <Button
                    variant="default"
                    icon={<PiDownloadSimpleDuotone />}
                    onClick={handleDownload}
                >
                    Скачать
                </Button>
            </div>
        </div>
    )
}

export default BackupCodesPanel
