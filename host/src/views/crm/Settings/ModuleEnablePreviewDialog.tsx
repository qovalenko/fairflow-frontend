import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { qa } from '@/shared/qa';
import { moduleEnablePreviewMessage } from './moduleEnablePreview';

type PreviewModule = { id: string; name: string; dependencies: string[] };

type PreviewState = {
  moduleId: string;
  moduleName: string;
  autoEnabled: PreviewModule[];
};

type Props = {
  preview: PreviewState | null;
  onClose: () => void;
  onConfirm: () => void;
};

/** FR-PROJ-300 — confirm what dependencies will auto-enable before turning a module on. */
export default function ModuleEnablePreviewDialog({ preview, onClose, onConfirm }: Props) {
  const isOpen = preview !== null;
  const body = preview
    ? moduleEnablePreviewMessage(preview.moduleName, preview.autoEnabled)
    : '';

  return (
    <ConfirmDialog
      {...qa('host.projectSettings.moduleEnablePreview.dialog')}
      isOpen={isOpen}
      type="info"
      title={
        preview?.moduleName
          ? `Включить модуль «${preview.moduleName}»?`
          : 'Включить модуль?'
      }
      confirmText="Включить"
      cancelText="Отмена"
      onClose={onClose}
      onRequestClose={onClose}
      onCancel={onClose}
      onConfirm={onConfirm}
      confirmButtonProps={qa('host.projectSettings.moduleEnablePreview.confirm')}
      cancelButtonProps={qa('host.projectSettings.moduleEnablePreview.cancel')}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{body}</p>
    </ConfirmDialog>
  );
}
