interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * High-contrast, zero-pill confirmation dialog
 * satisfying the mandatory user confirmation requirement for mutating Google Workspace operations.
 */
export default function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'CONFIRM ACTION',
  cancelLabel = 'CANCEL',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#111111] border border-white/20 p-6 sm:p-8 rounded-none text-white shadow-2xl">
        <span className="font-light text-xs uppercase tracking-tight text-neutral-400 block mb-2">
          USER CONFIRMATION REQUIRED
        </span>
        <h3 className="text-xl font-light tracking-tight text-white mb-3">
          {title}
        </h3>
        <p className="text-sm text-neutral-300 font-light leading-relaxed mb-8">
          {description}
        </p>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 font-light text-xs tracking-tight">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 rounded-none bg-transparent cursor-pointer uppercase tracking-wider"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-none cursor-pointer uppercase tracking-wider font-medium ${
              isDangerous
                ? 'bg-red-700 text-white hover:bg-red-600'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
