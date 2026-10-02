'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NewDepartmentForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [type, setType] = useState<'college' | 'office'>('college');
  const [officeLocation, setOfficeLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !short.trim()) {
      setError('Name and short code are both required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('departments').insert({
      name: name.trim(),
      short: short.trim().toUpperCase(),
      type,
      office_location: officeLocation.trim() || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName('');
    setShort('');
    setOfficeLocation('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md grid grid-cols-1 md:grid-cols-5 gap-sm items-end">
      <div className="md:col-span-2">
        <label className="font-label-caps text-label-caps text-on-surface-variant">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="College of Information and Computing Sciences" className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>
      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Short code</label>
        <input value={short} onChange={(e) => setShort(e.target.value)} placeholder="CICS" className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>
      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as 'college' | 'office')} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm">
          <option value="college">College</option>
          <option value="office">Office</option>
        </select>
      </div>
      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Office location</label>
        <input value={officeLocation} onChange={(e) => setOfficeLocation(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm" />
      </div>
      <button type="submit" disabled={saving} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60 h-fit">
        {saving ? 'Adding...' : 'Add Department'}
      </button>
      {error ? <p className="md:col-span-5 text-error font-body-sm">{error}</p> : null}
    </form>
  );
}