import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Crisp SVG QR code, byte mode, medium error correction. */
export function Qr({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [value]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={path.n + 4} height={path.n + 4} className="qr-bg" />
      <path d={path.d} className="qr-fg" />
    </svg>
  );
}
