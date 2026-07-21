import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '@gaby/shared';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { PrismaUserRepository } from '../../src/infrastructure/database/repositories/PrismaUserRepository.js';
import { PrismaSessionRepository } from '../../src/infrastructure/database/repositories/PrismaSessionRepository.js';
import { PrismaSettingsRepository } from '../../src/infrastructure/database/repositories/PrismaSettingsRepository.js';
import { PrismaAuditLogger } from '../../src/infrastructure/audit/PrismaAuditLogger.js';
import { Argon2Hasher } from '../../src/infrastructure/auth/Argon2Hasher.js';
import { JwtTokenService } from '../../src/infrastructure/auth/JwtTokenService.js';
import { Login } from '../../src/application/use-cases/auth/Login.js';
import { UnauthorizedError } from '../../src/domain/errors/AppError.js';

/**
 * Integración (RF-01, seguridad): flujo completo de `Login` — hash real
 * (argon2), JWT real, repos Prisma reales contra la BD de prueba. Cubre el
 * camino crítico de bloqueo por intentos fallidos (RN-07 / auditoría de
 * seguridad).
 */
describe('Login (integración)', () => {
  const suffix = Date.now();
  const username = `test-auth-${suffix}`;
  const password = 'Test1234';
  const MAX_ATTEMPTS = 3;

  const userRepo = new PrismaUserRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const settingsRepo = new PrismaSettingsRepository(prisma);
  const audit = new PrismaAuditLogger(prisma);
  const hasher = new Argon2Hasher();
  const tokens = new JwtTokenService();
  const login = new Login(userRepo, sessionRepo, settingsRepo, hasher, tokens, audit);

  let userId: string;

  beforeAll(async () => {
    await settingsRepo.setMany({ [SETTING_KEYS.AUTH_MAX_FAILED_ATTEMPTS]: MAX_ATTEMPTS });
    const role = await prisma.role.create({ data: { name: `TEST_AUTH_ROLE-${suffix}` } });
    const user = await prisma.user.create({
      data: {
        username,
        fullName: 'Usuario de prueba auth',
        passwordHash: await hasher.hash(password),
        roleId: role.id,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { name: `TEST_AUTH_ROLE-${suffix}` } });
    await prisma.appSetting.deleteMany({ where: { key: SETTING_KEYS.AUTH_MAX_FAILED_ATTEMPTS } });
  });

  it('rechaza una contraseña incorrecta sin revelar si el usuario existe', async () => {
    await expect(login.execute({ username, password: 'incorrecta' }, {})).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(
      login.execute({ username: 'usuario-que-no-existe', password: 'x' }, {}),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('login exitoso devuelve tokens y crea una sesión', async () => {
    const result = await login.execute({ username, password }, { ip: '127.0.0.1' });
    expect(result.user.username).toBe(username);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(1);
  });

  it('resetea los intentos fallidos tras un login exitoso', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedAttempts).toBe(0);
  });

  it(`bloquea la cuenta tras ${MAX_ATTEMPTS} intentos fallidos consecutivos`, async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(login.execute({ username, password: 'mala-clave' }, {})).rejects.toThrow(
        UnauthorizedError,
      );
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedAttempts).toBe(MAX_ATTEMPTS);
    expect(user.lockedUntil).not.toBeNull();
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('rechaza incluso con la contraseña correcta mientras la cuenta está bloqueada', async () => {
    await expect(login.execute({ username, password }, {})).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('cada intento fallido y el bloqueo quedan auditados (kind SECURITY)', async () => {
    const entries = await prisma.auditLog.findMany({
      where: { userId, kind: 'SECURITY' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
    expect(entries.some((e) => e.action === 'auth.login.lock-triggered')).toBe(true);
    expect(entries.some((e) => e.action === 'auth.login.locked')).toBe(true);
  });
});
