import { apiClient } from '@/core/api/client'
import type { VerifyResetTokenResult } from '@/core/auth/contracts'

export const authApi = {
  requestPasswordReset(email: string): Promise<void> {
    return apiClient.post('/auth/forgot-password', { email }, { auth: false })
  },
  verifyResetToken(token: string): Promise<VerifyResetTokenResult> {
    return apiClient.get(`/auth/verify-reset-token/${encodeURIComponent(token)}`, { auth: false })
  },
  resetPassword(token: string, newPassword: string): Promise<void> {
    return apiClient.post('/auth/reset-password', { token, newPassword }, { auth: false })
  },
}
