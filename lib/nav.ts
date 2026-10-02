// Navigation config — ported from NAV_LINKS / ROLE_LABEL / ROLE_DASHBOARDS in
// assets/js/shared.js, with hrefs converted from `/foo.html` to Next routes.
// New destinations (Assistant, Attendance, Department Members) are added here
// as their features land.

import type { Role } from './types';

export interface NavLink {
  href: string;
  icon: string;
  label: string;
  /** roles that must NOT interact (e.g. faculty can't Quick Record) */
  disabledFor?: Role[];
}

export const NAV_LINKS: Record<Role, NavLink[]> = {
  admin: [
    { href: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/admin/users', icon: 'group', label: 'User Management' },
    { href: '/admin/departments', icon: 'corporate_fare', label: 'Departments & Offices' },
    { href: '/admin/meetings', icon: 'event_note', label: 'All Meetings' },
    { href: '/assistant', icon: 'smart_toy', label: 'AI Assistant' },
    { href: '/admin/audit', icon: 'security', label: 'Audit & Privacy' },
    { href: '/admin/settings', icon: 'settings', label: 'System Settings' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  head: [
    { href: '/head/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/head/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/head/approvals', icon: 'fact_check', label: 'Approvals & Signing' },
    { href: '/head/delegate', icon: 'view_kanban', label: 'Task Delegation' },
    { href: '/head/members', icon: 'badge', label: 'Department Members' },
    { href: '/assistant', icon: 'smart_toy', label: 'AI Assistant' },
    { href: '/head/reports', icon: 'assessment', label: 'Reports' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  secretary: [
    { href: '/secretary/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/secretary/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/secretary/schedule', icon: 'event', label: 'Meeting Schedule' },
    { href: '/secretary/attendance', icon: 'how_to_reg', label: 'Attendance' },
    { href: '/secretary/live-recording', icon: 'mic', label: 'Live Recording' },
    { href: '/secretary/upload-audio', icon: 'upload_file', label: 'Upload Audio' },
    { href: '/secretary/transcript', icon: 'closed_caption', label: 'Transcripts' },
    { href: '/secretary/mom-editor', icon: 'description', label: 'Document Editor' },
    { href: '/assistant', icon: 'smart_toy', label: 'AI Assistant' },
    { href: '/secretary/archives', icon: 'history_edu', label: 'Archives' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  faculty: [
    { href: '/faculty/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/faculty/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/faculty/my-tasks', icon: 'task_alt', label: 'My Tasks' },
    { href: '/faculty/my-meetings', icon: 'groups', label: 'My Meetings' },
    { href: '/faculty/personal-meetings', icon: 'event_available', label: 'Personal Meetings' },
    { href: '/assistant', icon: 'smart_toy', label: 'AI Assistant' },
    { href: '/faculty/transcript-view', icon: 'closed_caption', label: 'Transcripts' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'System Administrator',
  head: 'College Dean / Head',
  secretary: 'Faculty Secretary',
  faculty: 'Faculty Member',
};

export const ROLE_DASHBOARDS: Record<Role, string> = {
  admin: '/admin/dashboard',
  head: '/head/dashboard',
  secretary: '/secretary/dashboard',
  faculty: '/faculty/dashboard',
};
