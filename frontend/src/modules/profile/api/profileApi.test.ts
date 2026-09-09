import { describe, expect, it, vi } from 'vitest'
import { changeOwnPassword, fetchOwnProfile, updateOwnProfile } from './profileApi'

describe('profile API', () => {
  it('requests the profile from the authenticated endpoint and updates only the strict allowlist', async () => {
    const get = vi.fn().mockResolvedValue({ idUsuario: 13, apellidoNombre: 'Lucía Test', roles: ['ALUMNO'] })
    const put = vi.fn().mockResolvedValue({ idUsuario: 13, apellidoNombre: 'Lucía Actualizada' })
    const profile = await fetchOwnProfile({ get })

    await updateOwnProfile(profile.idUsuario, {
      apellidoNombre: 'Lucía Actualizada', dni: '42666888', email: 'lucia@example.test', fechaNacimiento: '2000-01-01', telefono: '3624000000', cuil: '27426668880', contactoEmergencia: '', foto: '/img/lucia.jpg',
      rol: 'ADMINISTRATIVO', roles: ['ADMINISTRATIVO'], activo: false, password: 'secret', accessToken: 'token',
    }, { put })

    expect(get).toHaveBeenCalledWith('/auth/me')
    expect(put).toHaveBeenCalledWith('/users/13', {
      apellidoNombre: 'Lucía Actualizada', dni: '42666888', email: 'lucia@example.test', fechaNacimiento: '2000-01-01', telefono: '3624000000', cuil: '27426668880', contactoEmergencia: '', foto: '/img/lucia.jpg',
    })
  })

  it('changes the password through its dedicated endpoint and does not rotate local tokens', async () => {
    const put = vi.fn().mockResolvedValue({ message: 'Contraseña actualizada exitosamente' })
    await changeOwnPassword({ currentPassword: 'Actual1!', newPassword: 'Nueva1!' }, { put })

    expect(put).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'Actual1!', newPassword: 'Nueva1!' })
  })
})
