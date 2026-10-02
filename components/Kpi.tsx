// KPI card — the repeated stat card used across dashboards.

export interface Kpi {
  l: string;
  v: number | string;
  i: string;
  tone: 'primary' | 'tertiary';
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const accent = kpi.tone === 'primary' ? 'bg-primary' : 'bg-tertiary-container';
  const iconColor = kpi.tone === 'primary' ? 'text-primary' : 'text-tertiary-container';
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-1 h-full ${accent}`} />
      <div className="flex items-center justify-between mb-sm">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{kpi.l}</span>
        <span className={`material-symbols-outlined ${iconColor}`}>{kpi.i}</span>
      </div>
      <p className="font-display text-[36px] font-bold leading-none">{kpi.v}</p>
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
      {kpis.map((k) => (
        <KpiCard key={k.l} kpi={k} />
      ))}
    </div>
  );
}
