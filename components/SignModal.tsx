'use client';

// Canvas signature modal — React port of SMSignature.openSignModal() (signature.js).
// Self-contained: sets up a DPR-aware drawing surface and returns a PNG data URL.

import { useCallback, useEffect, useRef } from 'react';
import { useToast } from './Toast';

export function SignModal({
  open,
  onClose,
  title = 'Sign Document',
  subtitle = '',
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  onConfirm: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const toast = useToast();

  const setup = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#570000';
    ctx.lineWidth = 2.4;
  }, []);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    hasInk.current = false;
    setup(canvas);
    const ctx = canvas.getContext('2d')!;

    const coords = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pt = 'touches' in e ? e.touches[0] : (e as MouseEvent);
      return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
    };
    const down = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const p = coords(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = coords(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInk.current = true;
    };
    const up = () => {
      drawing.current = false;
    };
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', up);
    return () => {
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', up);
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', up);
    };
  }, [open, setup]);

  if (!open) return null;

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }
  function confirm() {
    if (!hasInk.current) {
      toast('Please draw your signature first', 'error');
      return;
    }
    const url = canvasRef.current!.toDataURL('image/png');
    onConfirm(url);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-md no-print">
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-2xl w-full max-w-[560px] overflow-hidden">
        <div className="px-lg py-md border-b border-outline-variant flex items-center justify-between bg-primary text-on-primary">
          <div>
            <h3 className="font-h3 text-h3">{title}</h3>
            {subtitle ? <p className="font-caption text-caption opacity-80 mt-xs">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="text-on-primary hover:opacity-80">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-lg">
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-sm">
            Draw your signature below using your mouse or finger.
          </p>
          <canvas ref={canvasRef} className="sig-canvas" style={{ height: '200px' }} />
          <div className="flex gap-sm justify-end mt-md">
            <button onClick={clear} className="px-md py-sm rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container">
              Clear
            </button>
            <button onClick={onClose} className="px-md py-sm rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container">
              Cancel
            </button>
            <button onClick={confirm} className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md hover:opacity-90 flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">draw</span> Apply Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
