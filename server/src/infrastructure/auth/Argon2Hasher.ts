import * as argon2 from 'argon2';
import type { IPasswordHasher } from '../../application/ports/IPasswordHasher.js';

/** argon2id: ganador del Password Hashing Competition, resistente a GPU. */
export class Argon2Hasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // hash corrupto/formato inválido = credenciales inválidas
    }
  }
}
