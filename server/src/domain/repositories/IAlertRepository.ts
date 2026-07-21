export interface AlertData {
  id: string;
  type: string;
  message: string;
  data: unknown;
  isRead: boolean;
  createdAt: Date;
}

export interface IAlertRepository {
  create(type: string, message: string, data?: unknown): Promise<AlertData>;
  listUnread(limit: number): Promise<AlertData[]>;
  /** No leídas de un tipo (deduplicación del cron de vencimientos). */
  listUnreadByType(type: string): Promise<AlertData[]>;
  markRead(id: string): Promise<void>;
}
