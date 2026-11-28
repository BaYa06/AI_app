import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from '../vendor/qrcode';

// QR читается только чёрным по белому — это не цвет интерфейса
const QR_LIGHT = '#FFFFFF'; // brand:data
const QR_DARK = '#000000'; // brand:data

/** QR-код ссылки: модули рисуем сами одним контуром (чёрное на белом — так читают все сканеры) */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 4 }; // 2 модуля белой рамки со всех сторон
  }, [value]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      accessibilityLabel="QR-код ссылки на курс"
    >
      <Rect width={count} height={count} fill={QR_LIGHT} />
      <Path d={path} fill={QR_DARK} />
    </Svg>
  );
}
