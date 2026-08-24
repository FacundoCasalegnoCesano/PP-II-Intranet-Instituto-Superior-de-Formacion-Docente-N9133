import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/bcrypt.js';

async function resetAdminPassword(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ Uso: npm run admin:reset-password <email> <newPassword>');
    console.error('   Ejemplo: npm run admin:reset-password admin@instituto.edu.ar NuevaPass1!');
    process.exit(1);
  }

  const email = args[0];
  const newPassword = args[1];

  if (!email || !newPassword) {
    console.error('❌ Email y nueva contraseña son requeridos');
    process.exit(1);
  }

  try {
    // Validar política de contraseña
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      console.error('❌ La contraseña debe tener: mínimo 8 caracteres, mayúscula, minúscula, número y símbolo especial');
      process.exit(3);
    }

    const user = await prisma.usuario.findUnique({
      where: { email }
    });

    if (!user) {
      console.error(`❌ Usuario no encontrado: ${email}`);
      process.exit(1);
    }

    // Verificar que tiene rol ADMINISTRATIVO
    const roles = (user.rol || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('ADMINISTRATIVO')) {
      console.error(`❌ El usuario ${email} no tiene rol ADMINISTRATIVO`);
      process.exit(2);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.usuario.update({
      where: { idUsuario: user.idUsuario },
      data: {
        passwordHash,
        activo: true // Desbloquear por las dudas
      }
    });

    console.log(`✅ Admin ${email} password reset via CLI at ${new Date().toISOString()}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error de base de datos:', error);
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();