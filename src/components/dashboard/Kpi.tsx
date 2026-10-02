/** Shared KPI stat card, port of the repeated .map(k => `...`) block in each
 * legacy dashboard's <script> (head/secretary/faculty share this exact
 * shape; admin's is a superset with a sub-caption, see admin/page.tsx). */
export function Kpi({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: 'primary' | 'tertiary';
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-1 h-full ${tone === 'primary' ? 'bg-primary' : 'bg-tertiary-container'}`} />
      <div className="flex items-center justify-between mb-sm">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{label}</span>
        <span className={`material-symbols-outlined ${tone === 'primary' ? 'text-primary' : 'text-tertiary-container'}`}>
          {icon}
        </span>
      </div>
      <p className="font-display text-[36px] font-bold leading-none">{value}</p>
    </div>
  );
}

export function Pill({ children, tone }: { children: React.ReactNode; tone: 'pending' | 'progress' | 'done' | 'overdue' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}