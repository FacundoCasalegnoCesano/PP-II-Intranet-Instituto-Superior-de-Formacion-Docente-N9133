import assert from 'node:assert/strict';
import express from 'express';
import { test } from 'node:test';

import config from '../src/config/env.js';
import authController from '../src/controllers/authController.js';
import userRepository from '../src/repositories/userRepository.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/jwt.js';

test('forgot-password limits each normalized email while retaining the generic response', async () => {
  const originalNodeEnv = config.nodeEnv;
  const originalHandler = authController.forgotPassword;
  const originalBackupHandler = authController.recoveryWithBackupCode;
  const originalCodesHandler = authController.revealMyBackupCodes;
  const originalFindAuth = userRepository.findAuthById;
  const originalFindSession = prisma.sesion.findFirst;
  config.nodeEnv = 'development';
  (authController as any).forgotPassword = async (_req: any, res: any) => {
    res.json({ message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña' });
  };
  (authController as any).recoveryWithBackupCode = async (_req: any, res: any) => {
    res.json({ message: 'Código procesado' });
  };
  (authController as any).revealMyBackupCodes = async (_req: any, res: any) => {
    res.json({ data: { codes: [] } });
  };
  (userRepository as any).findAuthById = async (id: number) => ({
    idUsuario: id, email: `admin${id}@example.edu.ar`, dni: 30000000 + id,
    apellidoNombre: 'Admin de prueba', activo: true, rol: 'ADMINISTRATIVO'
  });
  (prisma.sesion as any).findFirst = async () => ({ id: 1 });

  try {
    const { default: authRoutes } = await import('../src/routes/authRoutes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    try {
      const post = async (email: string) => fetch(`http://127.0.0.1:${address.port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await post(attempt % 2 ? 'PERSONA@example.edu.ar' : 'persona@example.edu.ar');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña'
        });
      }

      assert.equal((await post('otra-persona@example.edu.ar')).status, 200);
      assert.equal((await post('Persona@example.edu.ar')).status, 429);

      const backupPost = (email: string) => fetch(`http://127.0.0.1:${address.port}/api/auth/admin/backup-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: 'AAAA-BBBB', newPassword: 'Clave123!' })
      });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal((await backupPost(attempt % 2 ? 'ADMIN@example.edu.ar' : 'admin@example.edu.ar')).status, 200);
      }
      assert.equal((await backupPost('otro-admin@example.edu.ar')).status, 200);
      assert.equal((await backupPost('Admin@example.edu.ar')).status, 429);

      const actionPost = (userId: number) => fetch(`http://127.0.0.1:${address.port}/api/auth/my-backup-codes/reveal`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${generateAccessToken({
            id: userId, email: `admin${userId}@example.edu.ar`, dni: String(30000000 + userId),
            nombre: 'Admin de prueba', rol: 'ADMINISTRATIVO'
          })}`
        },
        body: JSON.stringify({ currentPassword: 'Clave123!' })
      });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        assert.equal((await actionPost(1)).status, 200);
      }
      assert.equal((await actionPost(2)).status, 200);
      assert.equal((await actionPost(1)).status, 429);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    config.nodeEnv = originalNodeEnv;
    (authController as any).forgotPassword = originalHandler;
    (authController as any).recoveryWithBackupCode = originalBackupHandler;
    (authController as any).revealMyBackupCodes = originalCodesHandler;
    (userRepository as any).findAuthById = originalFindAuth;
    (prisma.sesion as any).findFirst = originalFindSession;
  }
});
