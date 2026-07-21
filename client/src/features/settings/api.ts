import type { SettingsUpdateInput, SettingsValues } from '@gaby/shared';
import { api } from '@/lib/api';

export const settingsApi = {
  get: () => api.get<SettingsValues>('/settings'),
  update: (input: SettingsUpdateInput) => api.put<SettingsValues>('/settings', input),
};
