import type { Alert, Prisma, PrismaClient } from '@prisma/client';
import type { AlertData, IAlertRepository } from '../../../domain/repositories/IAlertRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';

function toData(a: Alert): AlertData {
  return { id: a.id, type: a.type, message: a.message, data: a.data, isRead: a.isRead, createdAt: a.createdAt };
}

export class PrismaAlertRepository implements IAlertRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(type: string, message: string, data?: unknown): Promise<AlertData> {
    const a = await this.db.alert.create({
      data: { type, message, data: (data as Prisma.InputJsonValue) ?? undefined },
    });
    return toData(a);
  }

  async listUnread(limit: number): Promise<AlertData[]> {
    const rows = await this.db.alert.findMany({
      where: { isRead: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toData);
  }

  async listUnreadByType(type: string): Promise<AlertData[]> {
    const rows = await this.db.alert.findMany({
      where: { isRead: false, type },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toData);
  }

  async markRead(id: string): Promise<void> {
    const res = await this.db.alert.updateMany({ where: { id }, data: { isRead: true } });
    if (res.count === 0) throw new NotFoundError('Alerta', id);
  }
}
