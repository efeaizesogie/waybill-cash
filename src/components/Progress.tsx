import { useState } from 'react';

/**
 * Shows what is happening under the hood. With `steps` and `current`, a stepped bar
 * ("Step 2 of 4: Approve in your wallet"); without, an indeterminate bar for open-ended waits.
 */
export function Progress({ steps, current, label, hint }: { steps?: string[]; current?: number; label: string; hint?: string }) {
  const stepped = steps && current !== undefined;
  const fill = stepped ? (current + 1) / steps.length : 0;
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className={`progress-track ${stepped ? '' : 'progress-indeterminate'}`}>
        <span className="progress-fill" style={stepped ? { transform: `scaleX(${fill})` } : undefined} />
      </div>
      <p className="progress-label">
        {stepped && <span className="progress-count mono">Step {current + 1} of {steps.length}</span>}
        <span>{label}</span>
      </p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/** A friendly error with the raw technical detail tucked away. */
export function ErrorNote({ message, detail, onRetry }: { message: string; detail?: string; onRetry?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="error-note" role="alert">
      <p className="form-error">{message}</p>
      <div className="error-actions">
        {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Try again</button>}
        {detail && <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details'}</button>}
      </div>
      {open && detail && <pre className="error-detail">{detail}</pre>}
    </div>
  );
}
