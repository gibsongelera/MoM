'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-semibold print-keep"
    >
      Print / PDF
    </button>
  );
}
