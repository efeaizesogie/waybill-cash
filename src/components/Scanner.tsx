import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** Full-screen camera scanner for the buyer's handover code. Opens the handover page on a match. */
export function Scanner({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 720 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (hit?.data) {
          const m = hit.data.match(/#\/(x\/[A-Za-z0-9_-]+|h\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)/);
          if (m) {
            stopped = true;
            location.hash = `#/${m[1]}`;
            onClose();
            return;
          }
          setMiss("That's not a Waybill handover code. Ask the buyer to tap Show handover code.");
        }
      }
      raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError('Camera blocked. Allow camera access for this site, or scan with your phone camera app instead.'));
    if (!navigator.mediaDevices) setError('This browser cannot open the camera. Scan with your phone camera app instead.');

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scan the buyer's handover code">
      <div className="scanner-panel">
        <div className="scanner-head">
          <h2 className="panel-title">Scan the buyer's code</h2>
          <button className="btn btn-quiet" onClick={onClose}>Close</button>
        </div>
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <div className="scanner-view">
            <video ref={video} playsInline muted />
            <span className="scanner-frame" aria-hidden="true" />
          </div>
        )}
        <p className="hint">{miss ?? 'Point the camera at the QR code on the buyer’s phone. Payment only goes to the seller.'}</p>
      </div>
    </div>
  );
}
