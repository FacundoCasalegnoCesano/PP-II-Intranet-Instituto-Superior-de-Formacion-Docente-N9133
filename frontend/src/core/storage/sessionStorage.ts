import type { AuthSession, Role, SessionTokens } from '@/core/auth/contracts'
import { ROLES } from '@/core/auth/contracts'

const SESSION_KEY = 'isfd.auth.session.v1'
const SESSION_VERSION = 1

interface StoredSession {
  version: typeof SESSION_VERSION
  session: AuthSession
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<AuthSession>
  return typeof session.accessToken === 'string'
    && typeof session.refreshToken === 'string'
    && typeof session.sessionId === 'number'
    && Array.isArray(session.roles)
    && session.roles.every(isRole)
    && (!session.role || isRole(session.role))
    && !!session.user
    && typeof session.user.idUsuario === 'number'
    && typeof session.user.apellidoNombre === 'string'
    && typeof session.user.dni === 'number'
    && typeof session.user.email === 'string'
    && typeof session.user.fechaNacimiento === 'string'
    && typeof session.user.telefono === 'string'
    && typeof session.user.activo === 'boolean'
    && typeof session.user.rol === 'string'
}

export class SessionStorage {
  constructor(private readonly storage: Storage | null = typeof window === 'undefined' ? null : window.sessionStorage) {}

  read(): AuthSession | null {
    if (!this.storage) return null

    try {
      const raw = this.storage.getItem(SESSION_KEY)
      if (!raw) return null

      const stored = JSON.parse(raw) as Partial<StoredSession>
      if (stored.version !== SESSION_VERSION || !isAuthSession(stored.session)) {
        this.clear()
        return null
      }

      return stored.session
    } catch {
      this.clear()
      return null
    }
  }

  save(session: AuthSession): void {
    if (!this.storage) return

    try {
      const stored: StoredSession = { version: SESSION_VERSION, session }
      this.storage.setItem(SESSION_KEY, JSON.stringify(stored))
    } catch {
      // Storage can be unavailable in private or quota-restricted contexts.
    }
  }

  updateTokens(tokens: SessionTokens): void {
    const current = this.read()
    if (!current) return

    this.save({ ...current, ...tokens })
  }

  clear(): void {
    try {
      this.storage?.removeItem(SESSION_KEY)
    } catch {
      // The caller still receives an empty in-memory session on the next read.
    }
  }
}

export const sessionStorage = new SessionStorage()
