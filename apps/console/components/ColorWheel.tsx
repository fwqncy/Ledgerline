'use client';

import { hsvToHex } from '@ledgerline/core/theme';
import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * An HSV colour wheel: angle is hue, distance from the centre is saturation.
 * Drag or click to pick; with focus, ←/→ turn the hue and ↑/↓ change saturation.
 */
export function ColorWheel({ value, onChange }: { value: Hsv; onChange: (next: Hsv) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const helpId = useId();

  const pick = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = clientX - rect.left - radius;
    const dy = clientY - rect.top - radius;
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    onChange({ ...value, h, s });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    pick(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event.clientX, event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const big = event.shiftKey ? 3 : 1;
    const next = { ...value };
    if (event.key === 'ArrowRight') next.h = (value.h + 5 * big) % 360;
    else if (event.key === 'ArrowLeft') next.h = (value.h - 5 * big + 360) % 360;
    else if (event.key === 'ArrowUp') next.s = Math.min(1, value.s + 0.05 * big);
    else if (event.key === 'ArrowDown') next.s = Math.max(0, value.s - 0.05 * big);
    else return;
    event.preventDefault();
    onChange(next);
  };

  const angle = (value.h * Math.PI) / 180;
  return (
    <>
      <div
        ref={ref}
        className="ll-wheel"
        role="slider"
        tabIndex={0}
        aria-label="Colour wheel"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(value.h)}
        aria-valuetext={`Hue ${Math.round(value.h)} degrees, saturation ${Math.round(value.s * 100)} percent`}
        aria-describedby={helpId}
        style={{ ['--v' as string]: value.v }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <span
          className="ll-wheel__handle"
          style={{
            left: `${50 + Math.cos(angle) * value.s * 50}%`,
            top: `${50 + Math.sin(angle) * value.s * 50}%`,
            background: hsvToHex(value.h, value.s, value.v),
          }}
        />
      </div>
      <p id={helpId} className="ll-visually-hidden">
        Use left and right arrow keys to change hue, up and down to change saturation. Hold Shift for bigger steps.
      </p>
    </>
  );
}
