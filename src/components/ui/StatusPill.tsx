import { cn } from '@/lib/ui/cn';
import { EMERGENCY_PILL, meetingStatus, meetingType } from '@/lib/ui/status';
import { Icon } from './Icon';

export function MeetingStatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const spec = meetingStatus(status);
  return <span className={cn('pill', spec.pill, className)}>{spec.label}</span>;
}

export function MeetingTypePill({
  type,
  subType,
  className,
}: {
  type: string | null | undefined;
  subType?: string | null;
  className?: string;
}) {
  const spec = meetingType(type);
  return (
    <span className={cn('pill', spec.pill, className)}>
      {spec.label}
      {subType ? ` · ${subType}` : ''}
    </span>
  );
}

export function EmergencyPill({ className }: { className?: string }) {
  return (
    <span className={cn('pill', EMERGENCY_PILL.pill, className)}>
      <Icon name="emergency" size={14} />
      {EMERGENCY_PILL.label}
    </span>
  );
}
