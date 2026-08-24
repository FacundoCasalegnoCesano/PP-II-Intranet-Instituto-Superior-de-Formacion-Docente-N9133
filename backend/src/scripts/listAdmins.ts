import { prisma } from '../config/prisma.js';
import { decryptBackupCodes } from '../utils/backupCodes.js';

async function listAdmins(): Promise<void> {
  try {
    const admins = await prisma.usuario.findMany({
      where: {
        rol: {
          contains: 'ADMINISTRATIVO'
        }
      },
      select: {
        idUsuario: true,
        email: true,
        apellidoNombre: true,
        rol: true,
        activo: true,
        ultimoAcceso: true,
        backupCodes: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (admins.length === 0) {
      console.log('ℹ️  No hay administradores en el sistema');
      return;
    }

    const tableData = admins.map((admin: any) => {
      let codesRemaining: number | string = '—';
      if (admin.backupCodes) {
        try {
          codesRemaining = decryptBackupCodes(admin.backupCodes).length;
        } catch {
          try {
            const parsed = JSON.parse(admin.backupCodes);
            codesRemaining = Array.isArray(parsed) ? `${parsed.length} (formato viejo)` : '—';
          } catch {
            codesRemaining = '—';
          }
        }
      }

      return {
        ID: admin.idUsuario,
        Email: admin.email,
        Nombre: admin.apellidoNombre,
        Rol: admin.rol,
        Activo: admin.activo ? '✅' : '❌',
        'Último Acceso': admin.ultimoAcceso 
          ? new Date(admin.ultimoAcceso).toLocaleString('es-AR')
          : 'Nunca',
        'Codes Restantes': codesRemaining
      };
    });

    console.log('\n📋 LISTA DE ADMINISTRADORES');
    console.log('='.repeat(100));
    console.table(tableData);
    console.log(`\nTotal: ${admins.length} administrador(es)\n`);
  } catch (error) {
    console.error('❌ Error al listar administradores:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

listAdmins();