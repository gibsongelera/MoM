'use client';

import { useMemo, useRef, useState } from 'react';
import { useRequireRole, useAuth } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { useData } from '@/components/DataProvider';
import { updateProfile, logAudit } from '@/lib/db';
import { uploadAvatar, signedAvatarUrl, dataUrlToBlob } from '@/lib/storage';
import { ROLE_LABEL } from '@/lib/nav';

export default function ProfilePage() {
  const { user, ready } = useRequireRole();
  const { setUser } = useAuth();
  const toast = useToast();
  usePageTitle('My Profile');
  const { departments, ready: dataReady, refresh } = useData();

  const dept = useMemo(
    () => (user ? departments.find((d) => d.id === user.departmentId) : null),
    [user, departments],
  );

  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [workingPhoto, setWorkingPhoto] = useState('');
  const [initialized, setInitialized] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // seed local form state from the user once available
  if (user && !initialized) {
    setName(user.name || '');
    setPosition(user.position || '');
    setWorkingPhoto(user.photoDataUrl || '');
    setInitialized(true);
  }

  if (!ready || !user || !dataReady) return null;

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file (PNG / JPG / WebP).', 'error');
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      toast('Image is large; it will be resized for storage.', 'info');
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 384;
        let { width, height } = img;
        if (width > height) {
          if (width > max) {
            height = Math.round(height * (max / width));
            width = max;
          }
        } else if (height > max) {
          width = Math.round(width * (max / height));
          height = max;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        setWorkingPhoto(canvas.toDataURL('image/jpeg', 0.85));
        toast('Photo ready. Click Save Changes to apply.', 'success');
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast('Name is required.', 'error');
      return;
    }
    try {
      // A freshly chosen image is a data: URL; upload it to the avatars bucket.
      // An emptied field clears the stored path.
      let photoPath: string | undefined;
      if (workingPhoto.startsWith('data:')) {
        photoPath = await uploadAvatar(user!.id, dataUrlToBlob(workingPhoto));
      } else if (workingPhoto === '' && user!.photoPath) {
        photoPath = '';
      }
      await updateProfile(user!.id, {
        name: name.trim(),
        position: position.trim(),
        ...(photoPath !== undefined ? { photoPath } : {}),
      });
      // Resolve the display URL for the topbar/avatar.
      let displayUrl = workingPhoto;
      if (photoPath) displayUrl = await signedAvatarUrl(photoPath);
      else if (photoPath === '') displayUrl = '';
      setWorkingPhoto(displayUrl);
      setUser({
        ...user!,
        name: name.trim(),
        position: position.trim(),
        photoPath: photoPath !== undefined ? photoPath : user!.photoPath,
        photoDataUrl: displayUrl,
      });
    } catch {
      return toast('Could not save profile', 'error');
    }
    void logAudit('profile_updated', `${name.trim()} updated profile fields: name, position${workingPhoto ? ', photo' : ''}`);
    toast('Profile saved.', 'success');
    await refresh();
  }

  const roField =
    'w-full rounded-lg border-outline-variant bg-surface-container font-body-md mt-xs';

  return (
    <div className="p-lg max-w-[960px] mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Profile</h1>
        <p className="font-body-md text-on-surface-variant">
          Manage your name, position, and optional photo. Sensitive personal fields (age, gender) are
          intentionally not collected.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-md">
        {/* Photo */}
        <section className="col-span-12 md:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">account_circle</span> Profile Photo
          </h3>
          <div className="flex flex-col items-center">
            <div className="mb-md">
              <Avatar user={{ name, photoDataUrl: workingPhoto }} size="w-40 h-40 text-[48px] shadow-primary-md" />
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`w-full border-2 border-dashed rounded-xl p-md text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/10' : 'border-outline-variant hover:border-primary hover:bg-primary/5'
              }`}
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[40px]">upload</span>
              <p className="font-body-sm mt-xs">
                Drag &amp; drop an image, or <span className="text-primary font-semibold">click to choose</span>
              </p>
              <p className="font-caption text-caption text-on-surface-variant">
                PNG / JPG / WebP - max ~5 MB. Stored securely in Supabase Storage.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {workingPhoto ? (
              <button
                onClick={() => setWorkingPhoto('')}
                className="mt-sm text-error hover:underline font-label-caps text-label-caps"
              >
                <span className="material-symbols-outlined text-[14px] align-middle">delete</span> Remove photo
              </button>
            ) : null}
          </div>
        </section>

        {/* Identity */}
        <section className="col-span-12 md:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">badge</span> Identity
          </h3>
          <form onSubmit={onSubmit} className="space-y-md">
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border-outline-variant bg-surface-container focus:border-primary focus:ring-0 font-body-md mt-xs"
                required
              />
            </div>
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant">Position / Title</label>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border-outline-variant bg-surface-container focus:border-primary focus:ring-0 font-body-md mt-xs"
                placeholder="e.g. Associate Professor"
              />
              <p className="font-caption text-caption text-on-surface-variant mt-xs">
                Shown next to your name across SmartMin.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant">Role</label>
                <input value={ROLE_LABEL[user.role] || user.role} className={roField} readOnly />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant">Department</label>
                <input value={dept ? `${dept.name} (${dept.short})` : '—'} className={roField} readOnly />
              </div>
            </div>
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant">Email</label>
              <input value={user.email} className={roField} readOnly />
              <p className="font-caption text-caption text-on-surface-variant mt-xs">
                Contact your administrator to change your email or department.
              </p>
            </div>
            <div className="bg-tertiary-fixed/40 border border-tertiary-container/40 rounded-lg p-sm flex gap-sm">
              <span className="material-symbols-outlined text-tertiary">lock</span>
              <div>
                <p className="font-body-sm font-semibold">Privacy by design</p>
                <p className="font-caption text-caption text-on-surface-variant">
                  SmartMin does not collect age, gender, or other sensitive demographics. Photos are stored
                  privately in your institutional Supabase Storage.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-sm">
              <button
                type="button"
                onClick={() => {
                  setName(user.name || '');
                  setPosition(user.position || '');
                  setWorkingPhoto(user.photoDataUrl || '');
                }}
                className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface"
              >
                Reset
              </button>
              <button
                type="submit"
                className="px-md py-sm rounded-lg bg-primary text-on-primary font-label-caps text-label-caps shadow-primary-md hover:opacity-90"
              >
                Save Changes
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
