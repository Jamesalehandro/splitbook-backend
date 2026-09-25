import bcrypt from 'bcryptjs';

import { config } from '../config';

export interface VerifyPasswordParams {
  /** The candidate value, as supplied by the caller. */
  plain: string;
  /** The stored bcrypt hash to check it against. */
  hash: string;
}

/** bcrypt wrappers. */
export class PasswordUtils {
  /**
   * A hash of a value nobody will ever submit, computed once at startup.
   *
   * Login compares against this when the email does not exist, so an unknown
   * address costs the same ~100ms as a wrong password. Skipping the comparison
   * instead would answer unknown emails noticeably faster and hand out a
   * reliable "is this person registered?" oracle to anyone with a stopwatch.
   */
  private static readonly decoyHash = bcrypt.hashSync(
    'this-account-does-not-exist',
    config.security.bcryptRounds,
  );

  /** @param {string} plain - The value to hash. */
  static hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, config.security.bcryptRounds);
  }

  static verify({ plain, hash }: VerifyPasswordParams): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** Spends the same time a real comparison would, and discards the result. */
  static async burnTimingBudget(): Promise<void> {
    await bcrypt.compare('this-account-does-not-exist', PasswordUtils.decoyHash);
  }
}
