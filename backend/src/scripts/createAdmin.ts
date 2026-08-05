import { prisma } from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function createAdmin(): Promise<void> {
  try {
    const existingAdmin = await prisma.usuario.findFirst({
      where: { roles: { some: { rol: 'ADMINISTRATIVO' } } }
    });

    if (existingAdmin) {
      console.log('✅ Ya existe un administrador en el sistema');
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log('ℹ️  Si olvidaste la contraseña, usa la funcionalidad de recuperación');
      return;
    }

    const passwordHash = await bcrypt.hash('Admin123!', 10);

    const admin = await prisma.usuario.create({
      data: {
        apellidoNombre: 'Administrador Sistema',
        dni: '12345678',
        email: 'admin@instituto.edu.ar',
        fechaNacimiento: new Date('1990-01-01'),
        telefono: '1234567890',
        passwordHash,
        cuil: '20123456789',
        activo: true,
        contactoEmergencia: '1111111111',
        roles: {
          create: { rol: 'ADMINISTRATIVO' }
        }
      }
    });

    console.log('✅ Administrador creado exitosamente');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Contraseña:', 'Admin123!');
    console.log('\n⚠️  IMPORTANTE: Cambia esta contraseña en el primer inicio de sesión');
  } catch (error) {
    console.error('❌ Error al crear administrador:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();