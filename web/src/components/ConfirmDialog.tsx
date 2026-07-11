interface ConfirmDialogProps {
  variant: "confirm" | "block";
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  variant,
  title,
  message,
  confirmLabel = "Move",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <div className="k-modal-backdrop" onClick={onClose}>
      <div
        className="k-modal k-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="k-modal__title">{title}</h2>
        <p className="k-confirm-dialog__message">{message}</p>
        <div className="k-confirm-dialog__actions">
          {variant === "confirm" && (
            <button
              className="k-confirm-dialog__button k-confirm-dialog__button--secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
          )}
          <button
            className="k-confirm-dialog__button k-confirm-dialog__button--primary"
            onClick={variant === "confirm" ? onConfirm : onClose}
            disabled={busy}
          >
            {busy ? "Moving…" : variant === "confirm" ? confirmLabel : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
