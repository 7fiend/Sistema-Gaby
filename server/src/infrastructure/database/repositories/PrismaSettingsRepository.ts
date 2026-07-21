import type { Prisma, PrismaClient } from '@prisma/client';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';

export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  private async get(key: string): Promise<unknown> {
    const row = await this.db.appSetting.findUnique({ where: { key } });
    return row?.value;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const v = await this.get(key);
    return typeof v === 'number' ? v : fallback;
  }

  async getString(key: string, fallback: string): Promise<string> {
    const v = await this.get(key);
    return typeof v === 'string' ? v : fallback;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.appSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value as unknown]));
  }

  async setMany(entries: Record<string, unknown>): Promise<void> {
    await this.db.$transaction(
      Object.entries(entries).map(([key, value]) =>
        this.db.appSetting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue },
          create: { key, value: value as Prisma.InputJsonValue },
        }),
      ),
    );
  }
}
