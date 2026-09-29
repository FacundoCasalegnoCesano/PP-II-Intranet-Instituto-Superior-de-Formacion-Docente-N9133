export function toPublicUser<T extends Record<string, any>>(
  user: T
): Omit<T, 'passwordHash' | 'backupCodes' | 'loginFailedCount' | 'loginLockedUntil'> {
  const publicUser = { ...user };
  delete publicUser.passwordHash;
  delete publicUser.backupCodes;
  delete publicUser.loginFailedCount;
  delete publicUser.loginLockedUntil;
  return publicUser;
}
