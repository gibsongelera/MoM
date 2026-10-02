'use client';

/**
 * Canvas signature pad (port of assets/js/signature.js) with two fixes:
 *
 * - Pointer coordinates are scaled to the canvas's internal resolution. CSS
 *   stretches the canvas to 100% width, so without scaling the ink landed
 *   offset from the pointer on any screen narrower or wider than 480px.
 * - "Type your name instead" renders a typed signature into the same PNG, so
 *   signing doesn't require a dragging gesture or a mouse (WCAG 2.1.1, 2.5.7).
 */
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { inputClass } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function SignaturePad({
  onChange,
  width = 480,
  height = 160,
  label = 'Signature',
}: {
  onChange?: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [typing, setTyping] = useState(false);
  const [typedName, setTypedName] = useState('');
  const typedId = useId();
  const hintId = useId();

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
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

  function wipe() {
    const ctx = getCtx();
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    hasInk.current = false;
  }

  function clear() {
    wipe();
    setTypedName('');
    setEmpty(true);
    onChange?.(null);
  }

  /** Renders the typed name as a signature into the canvas and reports the PNG. */
  function applyTyped(name: string) {
    setTypedName(name);
    wipe();
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const text = name.trim();
    if (!text) {
      setEmpty(true);
      onChange?.(null);
      return;
    }
    ctx.fillStyle = '#1a1c1c';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let size = 44;
    do {
      ctx.font = `italic ${size}px "Segoe Script", "Brush Script MT", cursive`;
      size -= 2;
    } while (ctx.measureText(text).width > canvas.width - 32 && size > 14);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    hasInk.current = true;
    setEmpty(false);
    onChange?.(canvas.toDataURL('image/png'));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="img"
        aria-label={empty ? `${label}: empty` : `${label}: signed`}
        aria-describedby={hintId}
        className="sig-canvas"
        onPointerDown={typing ? undefined : handlePointerDown}
        onPointerMove={typing ? undefined : handlePointerMove}
        onPointerUp={typing ? undefined : stopDrawing}
        onPointerLeave={typing ? undefined : stopDrawing}
      />
      {typing ? (
        <div className="mt-sm">
          <label htmlFor={typedId} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Type your full name to sign
          </label>
          <input
            id={typedId}
            className={`${inputClass} mt-xs`}
            value={typedName}
            maxLength={80}
            autoComplete="name"
            onChange={(e) => applyTyped(e.target.value)}
          />
        </div>
      ) : null}
      <div className="mt-xs flex flex-wrap items-center justify-between gap-sm">
        <p id={hintId} className="font-caption text-caption text-on-surface-variant">
          {typing ? 'Your typed name is used as your signature.' : 'Sign above with a mouse, stylus or finger.'}
        </p>
        <div className="flex gap-xs">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clear();
              setTyping((t) => !t);
            }}
          >
            {typing ? 'Draw instead' : 'Type your name instead'}
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} disabled={empty}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
