import type { CSSProperties } from 'react';

interface AtlasIconFrame {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

interface Props {
  src: string;
  sheetWidth: number;
  sheetHeight: number;
  frame: AtlasIconFrame;
  size: number;
  className?: string;
  label?: string;
}

export function AtlasIcon({
  src,
  sheetWidth,
  sheetHeight,
  frame,
  size,
  className = '',
  label,
}: Props) {
  const scale = Math.min(size / frame.sw, size / frame.sh);
  const frameWidth = frame.sw * scale;
  const frameHeight = frame.sh * scale;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url('${src}')`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
    backgroundPosition: `${
      (size - frameWidth) / 2 - frame.sx * scale
    }px ${
      (size - frameHeight) / 2 - frame.sy * scale
    }px`,
  };
  return (
    <span
      className={`atlas-icon ${className}`.trim()}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
