import { prisma } from '../config/prisma.js';
import { generateBackupCodes, encryptBackupCodes } from '../utils/backupCodes.js';

async function addCodesToExistingAdmins(): Promise<void> {
  try {
    const admins = await prisma.usuario.findMany({
      where: { rol: { contains: 'ADMINISTRATIVO' } }
    });

    if (admins.length === 0) {
      console.log('ℹ️  No hay administradores en el sistema');
      return;
    }

    let updated = 0;
    for (const admin of admins) {
      const needsNewCodes = !admin.backupCodes;
      if (!needsNewCodes) {
        try {
          JSON.parse(admin.backupCodes!);
          // Formato hash viejo: array de strings sin estructura {v, iv, tag, data}
          const parsed = JSON.parse(admin.backupCodes!);
          if (Array.isArray(parsed)) {
            console.log(`⚠️  ${admin.email}: códigos en formato antiguo (hasheado). Regenerando...`);
          } else {
            continue; // Ya está cifrado
          }
        } catch {
          continue; // No es JSON válido, asume cifrado
        }
      }

      const codes = generateBackupCodes(8);
      await prisma.usuario.update({
        where: { idUsuario: admin.idUsuario },
        data: { backupCodes: encryptBackupCodes(codes) }
      });
      updated++;

      console.log(`✅ Backup codes generados para ${admin.email}:`);
      codes.forEach(c => console.log(`   ${c}`));
      console.log('   ⚠️  Guardar en lugar seguro, no se volverán a mostrar por consola\n');
    }

    if (updated === 0) {
      console.log('✅ Todos los administradores ya tienen códigos en formato actual');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addCodesToExistingAdmins();