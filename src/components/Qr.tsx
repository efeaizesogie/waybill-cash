import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Crisp SVG QR code, byte mode, 4-module quiet zone so phone cameras lock on. */
export function Qr({ value, size = 220, label, ecc = 'M' }: { value: string; size?: number; label: string; ecc?: 'L' | 'M' }) {
  const path = useMemo(() => {
    const qr = qrcode(0, ecc);
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [value, ecc]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`-4 -4 ${path.n + 8} ${path.n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={path.n + 8} height={path.n + 8} className="qr-bg" />
      <path d={path.d} className="qr-fg" />
    </svg>
  );
}
