'use client';

/** Minimal canvas signature pad, port of assets/js/signature.js's core
 * drawing logic (pointer events, not separate mouse/touch handlers - covers
 * both without duplicating listeners). */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataUrl: () => string;
  clear: () => void;
}

export default function SignaturePad({
  onChange,
  width = 480,
  height = 160,
}: {
  onChange?: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1c1c';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
    setEmpty(false);
  }

  function stopDrawing() {
    drawing.current = false;
    if (hasInk.current && canvasRef.current) onChange?.(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const ctx = getCtx();
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    hasInk.current = false;
    setEmpty(true);
    onChange?.(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="sig-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div className="flex justify-between items-center mt-xs">
        <p className="font-caption text-caption text-on-surface-variant">Sign above with your mouse, stylus, or finger.</p>
        <button type="button" onClick={clear} disabled={empty} className="font-label-caps text-label-caps text-on-surface-variant hover:text-error disabled:opacity-40">
          Clear
        </button>
      </div>
    </div>
  );
}