'use client';

/**
 * Port of assets/js/charts.js's Chart.js helpers as React components.
 *
 * One deliberate change: the legacy aiAccuracyTrend() plotted a hardcoded
 * array with the comment "Synthesized monthly accuracy trend (96-99%)" -
 * invented numbers with no measurement behind them. There is no real
 * accuracy pipeline yet (that is the Phase 8 evaluation harness from the
 * migration plan). JobsStatusChart replaces it with something actually
 * measured: transcription_jobs grouped by status.
 */
import { useEffect, useRef } from 'react';
import Chart, { type ChartConfiguration, type ChartType } from 'chart.js/auto';

const PRIMARY = '#570000';
const PRIMARY_LIGHT = 'rgba(87,0,0,0.12)';
const TERTIARY = '#cba72f';
const OUTLINE = '#e2bfb9';
const AXIS_TEXT = '#5a413d';

function commonOptions(noScales = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: 'Inter', size: 12, weight: 600 as const }, color: AXIS_TEXT }, position: 'bottom' as const },
      tooltip: { backgroundColor: '#1a1c1c', titleFont: { family: 'Public Sans', weight: 600 as const }, padding: 10, cornerRadius: 8 },
    },
    scales: noScales
      ? {}
      : {
          x: { grid: { display: false }, ticks: { color: AXIS_TEXT, font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: OUTLINE }, ticks: { color: AXIS_TEXT, font: { family: 'Inter', size: 11 } } },
        },
  };
}

function useChart<T extends ChartType>(config: ChartConfiguration<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<T> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is rebuilt by the caller each render from fresh data; deep-comparing it here would just re-run every render anyway
  }, [JSON.stringify(config.data)]);

  return canvasRef;
}

export function MeetingsLineChart({ countsByMonth }: { countsByMonth: number[] }) {
  const ref = useChart({
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        {
          label: 'Meetings',
          data: countsByMonth,
          borderColor: PRIMARY,
          backgroundColor: PRIMARY_LIGHT,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: PRIMARY,
        },
      ],
    },
    options: commonOptions(),
  });
  return <canvas ref={ref} />;
}

export function TasksDoughnutChart({ pending, inProgress, done }: { pending: number; inProgress: number; done: number }) {
  const ref = useChart({
    type: 'doughnut',
    data: {
      labels: ['Pending', 'In Progress', 'Done'],
      datasets: [
        {
          data: [pending, inProgress, done],
          backgroundColor: ['#e2bfb9', TERTIARY, PRIMARY],
          borderColor: '#ffffff',
          borderWidth: 3,
        },
      ],
    },
    options: { ...commonOptions(true), cutout: '65%' },
  });
  return <canvas ref={ref} />;
}

export function RolesBarChart({ admin, head, secretary, faculty }: { admin: number; head: number; secretary: number; faculty: number }) {
  const ref = useChart({
    type: 'bar',
    data: {
      labels: ['Admin', 'Head', 'Secretary', 'Faculty'],
      datasets: [
        {
          label: 'Users',
          data: [admin, head, secretary, faculty],
          backgroundColor: [PRIMARY, '#800000', TERTIARY, '#735c00'],
          borderRadius: 6,
        },
      ],
    },
    options: commonOptions(),
  });
  return <canvas ref={ref} />;
}

export function JobsStatusChart({
  queued,
  processing,
  completed,
  failed,
}: {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}) {
  const ref = useChart({
    type: 'bar',
    data: {
      labels: ['Queued', 'Processing', 'Completed', 'Failed'],
      datasets: [
        {
          label: 'Transcription jobs',
          data: [queued, processing, completed, failed],
          backgroundColor: [OUTLINE, TERTIARY, '#2e7d32', '#ba1a1a'],
          borderRadius: 6,
        },
      ],
    },
    options: commonOptions(),
  });
  return <canvas ref={ref} />;
}