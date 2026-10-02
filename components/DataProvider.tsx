'use client';

// Loads the signed-in user's RLS-scoped data from Supabase into memory and
// exposes it through useData(). This is the async replacement for the old
// synchronous localStorage reads — the source of truth is now Postgres.
// Pages read collections from here and call mutation helpers in lib/db, then
// refresh().

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { loadAll, defaultSettings, mapNotification } from '@/lib/db';
import { signedAvatarUrls, signedAudioUrls } from '@/lib/storage';
import type {
  Attendance,
  AudioRecording,
  AuditEntry,
  Department,
  Meeting,
  Minutes,
  Notification,
  PersonalMeeting,
  Settings,
  Task,
  Taxonomy,
  Transcript,
  User,
} from '@/lib/types';

interface DataState {
  departments: Department[];
  users: User[];
  meetings: Meeting[];
  tasks: Task[];
  transcripts: Transcript[];
  minutes: Minutes[];
  personalMeetings: PersonalMeeting[];
  notifications: Notification[];
  attendance: Attendance[];
  settings: Settings;
  taxonomy: Taxonomy;
  audit: AuditEntry[];
  audioRecordings: AudioRecording[];
}

const EMPTY: DataState = {
  departments: [],
  users: [],
  meetings: [],
  tasks: [],
  transcripts: [],
  minutes: [],
  personalMeetings: [],
  notifications: [],
  attendance: [],
  settings: defaultSettings(),
  taxonomy: { capstone: [], research: [] },
  audit: [],
  audioRecordings: [],
};

interface DataContextValue extends DataState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<DataState>(EMPTY);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = user?.role;
  const uid = user?.id;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadAll(role || 'faculty');
      // Resolve avatar object paths to short-lived signed URLs for display.
      const paths = data.users.map((u) => u.photoPath || '').filter(Boolean);
      if (paths.length) {
        try {
          const map = await signedAvatarUrls(paths);
          data.users = data.users.map((u) =>
            u.photoPath && map[u.photoPath] ? { ...u, photoDataUrl: map[u.photoPath] } : u,
          );
        } catch {
          /* avatars are non-essential; fall back to initials */
        }
      }
      // Resolve meeting-audio object paths to signed playback URLs.
      const audioPaths = data.audioRecordings.map((a) => a.storagePath).filter(Boolean);
      if (audioPaths.length) {
        try {
          const map = await signedAudioUrls(audioPaths);
          data.audioRecordings = data.audioRecordings.map((a) =>
            map[a.storagePath] ? { ...a, url: map[a.storagePath] } : a,
          );
        } catch {
          /* playback URLs are non-essential */
        }
      }
      setState(data);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [uid, role]);

  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      setState(EMPTY);
      setReady(false);
      return;
    }
    void load();
  }, [authLoading, uid, load]);

  // Live notifications (rec #2): re-pull just the notifications slice on any
  // change to the current user's rows. RLS keeps this to their own alerts.
  useEffect(() => {
    if (!uid) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        async () => {
          const { data } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });
          setState((s) => ({ ...s, notifications: (data ?? []).map(mapNotification) }));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid]);

  return (
    <DataContext.Provider value={{ ...state, ready, loading, error, refresh: load }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within <DataProvider>');
  return ctx;
}
