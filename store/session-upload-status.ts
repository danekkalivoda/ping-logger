import { create } from 'zustand';

export type SessionUploadStatus = 'idle' | 'syncing' | 'error';

type SessionUploadStatusState = {
  status: SessionUploadStatus;
  pendingCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  setIdle: (pendingCount?: number) => void;
  setSyncing: (pendingCount: number) => void;
  setError: (message: string, pendingCount: number) => void;
};

export const useSessionUploadStatusStore = create<SessionUploadStatusState>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastError: null,
  lastSyncedAt: null,
  setIdle: (pendingCount = 0) =>
    set((state) => ({
      status: 'idle',
      pendingCount,
      lastError: null,
      lastSyncedAt: pendingCount === 0 ? new Date().toISOString() : state.lastSyncedAt,
    })),
  setSyncing: (pendingCount) =>
    set({
      status: 'syncing',
      pendingCount,
      lastError: null,
    }),
  setError: (message, pendingCount) =>
    set({
      status: 'error',
      pendingCount,
      lastError: message,
    }),
}));
