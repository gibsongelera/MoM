'use client';

/**
 * Photo upload replaces the legacy's base64-into-localStorage approach with
 * a real Supabase Storage write (avatars bucket, private, RLS-scoped to
 * `${userId}/*`). Path is fixed at `${userId}/photo.jpg` with upsert:true,
 * so re-uploading never accumulates orphaned objects the way the legacy's
 * every-save-is-a-new-blob approach would have.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { ROLE_LABEL } from '@/lib/types/domain';
import { initials } from '@/lib/utils/initials';

const MAX_DIMENSION = 384;

function resizeToJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round(height * (MAX_DIMENSION / width));
            width = MAX_DIMENSION;
          }
        } else if (height > MAX_DIMENSION) {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/jpeg', 0.85);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileForm({
  user,
  departmentLabel,
}: {
  user: DashboardUser;
  departmentLabel: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name);
  const [position, setPosition] = useState(user.position ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(user.photoUrl);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setMessage({ tone: 'error', text: 'Please choose an image file (PNG / JPG / WebP).' });
      return;
    }
    try {
      const blob = await resizeToJpeg(file);
      setPendingBlob(blob);
      setRemovePhoto(false);
      setPreviewUrl(URL.createObjectURL(blob));
      setMessage({ tone: 'info', text: 'Photo ready. Click Save Changes to apply.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not process that image. Try a different file.' });
    }
  }

  function handleRemovePhoto() {
    setPendingBlob(null);
    setPreviewUrl(null);
    setRemovePhoto(true);
  }

  function handleReset() {
    setName(user.name);
    setPosition(user.position ?? '');
    setPreviewUrl(user.photoUrl);
    setPendingBlob(null);
    setRemovePhoto(false);
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ tone: 'error', text: 'Name is required.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let photoPath = user.photo_path;

      if (pendingBlob) {
        const path = `${user.id}/photo.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, pendingBlob, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;
        photoPath = path;
      } else if (removePhoto) {
        photoPath = null;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ name: name.trim(), position: position.trim() || null, photo_path: photoPath })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setMessage({ tone: 'success', text: 'Profile saved.' });
      setPendingBlob(null);
      setRemovePhoto(false);
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save your profile.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-md">
      <section className="col-span-12 md:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">account_circle</span> Profile Photo
        </h3>
        <div className="flex flex-col items-center">
          <div className="mb-md">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL / signed Storage URL, not a static asset
              <img
                src={previewUrl}
                alt={name}
                className="w-40 h-40 text-[48px] shadow-primary-md rounded-full object-cover border border-outline-variant"
              />
            ) : (
              <div className="w-40 h-40 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[48px] shadow-primary-md">
                {initials(name)}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-outline-variant rounded-xl p-md text-center hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[40px]">upload</span>
            <p className="font-body-sm mt-xs">
              Click to choose <span className="text-primary font-semibold">an image</span>
            </p>
            <p className="font-caption text-caption text-on-surface-variant">PNG / JPG / WebP · resized to 384px</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />

          {previewUrl ? (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="mt-sm text-error hover:underline font-label-caps text-label-caps"
            >
              <span className="material-symbols-outlined text-[14px] align-middle">delete</span> Remove photo
            </button>
          ) : null}
        </div>
      </section>

      <section className="col-span-12 md:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">badge</span> Identity
        </h3>

        <form className="space-y-md" onSubmit={handleSubmit}>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant" htmlFor="f-name">
              Full Name
            </label>
            <input
              id="f-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border-outline-variant bg-surface-container focus:border-primary focus:ring-0 font-body-md mt-xs"
            />
          </div>
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant" htmlFor="f-position">
              Position / Title
            </label>
            <input
              id="f-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Associate Professor"
              className="w-full rounded-lg border-outline-variant bg-surface-container focus:border-primary focus:ring-0 font-body-md mt-xs"
            />
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Shown next to your name across SmartMin.</p>
          </div>

          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant">Role</label>
              <input value={ROLE_LABEL[user.role]} readOnly className="w-full rounded-lg border-outline-variant bg-surface-container font-body-md mt-xs" />
            </div>
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant">Department</label>
              <input value={departmentLabel} readOnly className="w-full rounded-lg border-outline-variant bg-surface-container font-body-md mt-xs" />
            </div>
          </div>

          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant">Email</label>
            <input value={user.email} readOnly className="w-full rounded-lg border-outline-variant bg-surface-container font-body-md mt-xs" />
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Contact your administrator to change your email or department.</p>
          </div>

          <div className="bg-tertiary-fixed/40 border border-tertiary-container/40 rounded-lg p-sm flex gap-sm">
            <span className="material-symbols-outlined text-tertiary">lock</span>
            <div>
              <p className="font-body-sm font-semibold">Privacy by design</p>
              <p className="font-caption text-caption text-on-surface-variant">
                SmartMin does not collect age, gender, or other sensitive demographics.
              </p>
            </div>
          </div>

          {message ? (
            <div
              className={`font-body-sm rounded-lg p-sm ${
                message.tone === 'error'
                  ? 'text-error bg-error-container'
                  : message.tone === 'success'
                    ? 'text-success bg-success-container'
                    : 'text-on-surface-variant bg-surface-container'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <div className="flex justify-end gap-sm">
            <button
              type="button"
              onClick={handleReset}
              className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-caps text-label-caps shadow-primary-md hover:opacity-90 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}