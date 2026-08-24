import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/bcrypt.js';
import { generateBackupCodes, encryptBackupCodes } from '../utils/backupCodes.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

function printBackupCodes(codes: string[]): void {
  const rows: string[] = [];
  for (let i = 0; i < codes.length; i += 3) {
    const chunk = codes.slice(i, i + 3);
    rows.push(chunk.map(c => `  ${c}  `).join(' ║ '));
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║  BACKUP CODES - GUARDAR EN SEGURO                                ║');
  console.log('║  (Cada código se usa 1 sola vez, no expiran)                     ║');
  console.log('╠═══════════════════════════════════════════════════════════════════╣');
  rows.forEach(row => console.log(`║ ${row.padEnd(62)} ║`));
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

async function createAdmin(): Promise<void> {
  try {
    const existingAdmin = await prisma.usuario.findFirst({
      where: { rol: { contains: 'ADMINISTRATIVO' } }
    });

    if (existingAdmin) {
      console.log('✅ Ya existe un administrador en el sistema');
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log('ℹ️  Si olvidaste la contraseña, usa la funcionalidad de recuperación');
      return;
    }

    const passwordHash = await hashPassword('Admin123!');

    const backupCodesPlain = generateBackupCodes(8);
    const backupCodesEncrypted = encryptBackupCodes(backupCodesPlain);

    const admin = await prisma.usuario.create({
      data: {
        apellidoNombre: 'Administrador Sistema',
        dni: 12345678,
        email: 'admin@instituto.edu.ar',
        fechaNacimiento: new Date('1990-01-01'),
        telefono: '1234567890',
        passwordHash,
        cuil: '20123456789',
        rol: 'ADMINISTRATIVO',
        activo: true,
        contactoEmergencia: '1111111111',
        backupCodes: backupCodesEncrypted
      }
    });

    console.log('✅ Administrador creado exitosamente');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Contraseña:', 'Admin123!');
    console.log('\n⚠️  IMPORTANTE: Cambia esta contraseña en el primer inicio de sesión');

    printBackupCodes(backupCodesPlain);

    console.log('💾 Guarda estos códigos en un lugar seguro (papel, gestor de contraseñas).');
    console.log('   NO se volverán a mostrar por consola (podés verlos desde tu perfil en la UI).\n');
  } catch (error) {
    console.error('❌ Error al crear administrador:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();