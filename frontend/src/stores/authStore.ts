import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { apiClient } from '@/core/api/client'
import type {
  AuthSession,
  LoginInput,
  LoginResult,
  Role,
  SelectRoleResult,
} from '@/core/auth/contracts'
import { ROLES } from '@/core/auth/contracts'
import { sessionStorage } from '@/core/storage/sessionStorage'

export type AuthStatus = 'anonymous' | 'role_pending' | 'authenticated'

function normalizeRole(value: unknown): Role | undefined {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return (ROLES as readonly string[]).includes(role) ? role as Role : undefined
}

export function normalizeRoles(values: unknown): Role[] {
  if (!Array.isArray(values)) return []

  return [...new Set(values.map(normalizeRole).filter((role): role is Role => !!role))]
}

function sessionStatus(session: AuthSession | null): AuthStatus {
  return session?.role && session.roles.includes(session.role) ? 'authenticated' : session ? 'role_pending' : 'anonymous'
}

export const useAuthStore = defineStore('auth', () => {
  const currentSession = ref<AuthSession | null>(null)
  const status = ref<AuthStatus>('anonymous')

  const user = computed(() => currentSession.value?.user)
  const roles = computed(() => currentSession.value?.roles ?? [])
  const activeRole = computed(() => currentSession.value?.role)
  const isAuthenticated = computed(() => status.value === 'authenticated')
  const needsRoleSelection = computed(() => status.value === 'role_pending')

  function applySession(session: AuthSession | null): void {
    if (!session) {
      currentSession.value = null
      status.value = 'anonymous'
      return
    }

    const roles = normalizeRoles(session.roles)
    const role = normalizeRole(session.role)
    const normalized: AuthSession = {
      ...session,
      roles,
      ...(role && roles.includes(role) ? { role } : {}),
    }

    if (!role || !roles.includes(role)) delete normalized.role
    currentSession.value = normalized
    status.value = sessionStatus(normalized)
  }

  function clearSession(): void {
    sessionStorage.clear()
    applySession(null)
  }

  function updateCurrentUser(user: AuthSession['user']): void {
    const session = currentSession.value
    if (!session) return
    const updated = { ...session, user }
    sessionStorage.save(updated)
    applySession(updated)
  }

  apiClient.setSessionInvalidationHandler(clearSession)

  async function restore(): Promise<void> {
    applySession(sessionStorage.read())
  }

  async function login(input: LoginInput): Promise<void> {
    const result = await apiClient.post<LoginResult>('/auth/login', input, { auth: false })
    const session: AuthSession = {
      ...result,
      roles: normalizeRoles(result.roles),
    }

    if (session.roles.length === 0) {
      clearSession()
      throw new Error('La cuenta no tiene un rol institucional válido')
    }

    sessionStorage.save(session)
    applySession(session)

    if (session.roles.length === 1) await selectRole(session.roles[0])
  }

  async function selectRole(roleInput: Role): Promise<void> {
    const role = normalizeRole(roleInput)
    const session = currentSession.value

    if (!session || !role || !session.roles.includes(role)) {
      throw new Error('El rol seleccionado no está disponible para esta sesión')
    }

    const result = await apiClient.post<SelectRoleResult>('/auth/select-role', { role })
    const roles = normalizeRoles(result.rolesDisponibles)
    const selectedRole = normalizeRole(result.rol)

    if (!selectedRole || selectedRole !== role || !roles.includes(selectedRole)) {
      throw new Error('El servidor devolvió un rol inválido')
    }

    const updated: AuthSession = {
      ...session,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      roles,
      role: selectedRole,
    }

    sessionStorage.save(updated)
    applySession(updated)
  }

  async function logout(): Promise<void> {
    try {
      const session = currentSession.value ?? sessionStorage.read()
      if (session) await apiClient.post('/auth/logout')
    } finally {
      clearSession()
    }
  }

  return {
    status,
    user,
    roles,
    activeRole,
    isAuthenticated,
    needsRoleSelection,
    restore,
    login,
    selectRole,
    logout,
    clearSession,
    updateCurrentUser,
  }
})
