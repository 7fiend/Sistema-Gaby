import type { BackupRecord, BackupType, Paginated } from '@gaby/shared';
import { api, downloadFile } from '@/lib/api';

export const BACKUP_TYPE_LABELS: Record<BackupType, string> = {
  MANUAL: 'Manual',
  SCHEDULED: 'Programado',
};

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const backupsApi = {
  list: (params: { page: number; type?: BackupType }) =>
    api.get<Paginated<BackupRecord>>(`/backups${qs(params)}`),
  create: () => api.post<BackupRecord>('/backups'),
  download: (id: string) => downloadFile(`/backups/${id}/download`),
  restore: (id: string, confirmation: string) =>
    api.post<{ restored: boolean }>(`/backups/${id}/restore`, { confirmation }),
};
