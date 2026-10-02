'use client';

// Chart.js wrappers — React port of assets/js/charts.js using react-chartjs-2.
// Same brand colors and options as the original admin dashboards.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import type { Meeting, Task, User } from '@/lib/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

const PRIMARY = '#570000';
const PRIMARY_LIGHT = 'rgba(87,0,0,0.12)';
const TERTIARY = '#cba72f';
const TERTIARY_LIGHT = 'rgba(203,167,47,0.18)';
const OUTLINE = '#e2bfb9';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function commonOpts(noScales = false): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { font: { family: 'Inter', size: 12, weight: 600 }, color: '#5a413d' },
        position: 'bottom',
      },
      tooltip: {
        backgroundColor: '#1a1c1c',
        titleFont: { family: 'Public Sans', weight: 600 },
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: noScales
      ? {}
      : {
          x: { grid: { display: false }, ticks: { color: '#5a413d', font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: OUTLINE }, ticks: { color: '#5a413d', font: { family: 'Inter', size: 11 } } },
        },
  };
}

export function MeetingsPerMonth({ meetings }: { meetings: Meeting[] }) {
  const counts = Array(12).fill(0);
  meetings.forEach((m) => {
    const d = new Date(m.date);
    if (!isNaN(d.getTime())) counts[d.getMonth()] += 1;
  });
  return (
    <Line
      data={{
        labels: MONTHS,
        datasets: [
          {
            label: 'Meetings',
            data: counts,
            borderColor: PRIMARY,
            backgroundColor: PRIMARY_LIGHT,
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: PRIMARY,
          },
        ],
      }}
      options={commonOpts() as ChartOptions<'line'>}
    />
  );
}

export function TasksDoughnut({ tasks }: { tasks: Task[] }) {
  const buckets = { pending: 0, in_progress: 0, done: 0 } as Record<string, number>;
  tasks.forEach((t) => {
    if (buckets[t.status] != null) buckets[t.status]++;
  });
  return (
    <Doughnut
      data={{
        labels: ['Pending', 'In Progress', 'Done'],
        datasets: [
          {
            data: [buckets.pending, buckets.in_progress, buckets.done],
            backgroundColor: ['#e2bfb9', TERTIARY, PRIMARY],
            borderColor: '#ffffff',
            borderWidth: 3,
          },
        ],
      }}
      options={{ ...commonOpts(true), cutout: '65%' } as ChartOptions<'doughnut'>}
    />
  );
}

export function UsersByRole({ users }: { users: User[] }) {
  const buckets = { admin: 0, head: 0, secretary: 0, faculty: 0 } as Record<string, number>;
  users.forEach((u) => {
    if (buckets[u.role] != null) buckets[u.role]++;
  });
  return (
    <Bar
      data={{
        labels: ['Admin', 'Head', 'Secretary', 'Faculty'],
        datasets: [
          {
            label: 'Users',
            data: [buckets.admin, buckets.head, buckets.secretary, buckets.faculty],
            backgroundColor: [PRIMARY, '#800000', TERTIARY, '#735c00'],
            borderRadius: 6,
          },
        ],
      }}
      options={commonOpts() as ChartOptions<'bar'>}
    />
  );
}

export function AiAccuracyTrend() {
  const data = [96.2, 97.1, 96.8, 97.5, 98.0, 97.9, 98.4, 98.2, 98.6, 98.4, 98.8, 98.9];
  const opts = commonOpts();
  opts.scales = {
    y: { suggestedMin: 95, suggestedMax: 100, grid: { color: OUTLINE }, ticks: { color: '#5a413d' } },
    x: { grid: { display: false }, ticks: { color: '#5a413d' } },
  };
  return (
    <Line
      data={{
        labels: MONTHS,
        datasets: [
          {
            label: 'AI Accuracy %',
            data,
            borderColor: TERTIARY,
            backgroundColor: TERTIARY_LIGHT,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: TERTIARY,
          },
        ],
      }}
      options={opts as ChartOptions<'line'>}
    />
  );
}
