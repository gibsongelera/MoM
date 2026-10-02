// Client helpers to download server-generated documents (rec #5).

export interface MinutesExportPayload {
  meeting: { title: string; date: string; venue: string; department: string; chair: string; secretary: string };
  minutes: {
    documentTitle?: string;
    callToOrder?: string;
    previousMinutes?: string;
    agendaItems?: { title: string; notes: string }[];
    adjournment?: string;
  };
  tasks?: { title: string; assignee: string; deadline: string; status: string }[];
  motions?: { text: string; result: string; votesFor: number; votesAgainst: number; votesAbstain: number }[];
}

export async function downloadMinutesDocx(payload: MinutesExportPayload, filename: string): Promise<void> {
  const res = await fetch('/api/export/minutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
