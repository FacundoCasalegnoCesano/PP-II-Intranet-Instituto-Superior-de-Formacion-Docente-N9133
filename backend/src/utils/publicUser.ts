export function toPublicUser<T extends Record<string, any>>(
  user: T
): Omit<T, 'passwordHash' | 'backupCodes'> {
  const publicUser = { ...user };
  delete publicUser.passwordHash;
  delete publicUser.backupCodes;
  return publicUser;
}
