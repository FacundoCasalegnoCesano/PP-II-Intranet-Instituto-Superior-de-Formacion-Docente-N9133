import { prisma } from '../config/prisma.js';

async function initRoles() {
  try {
    const roles = [
      { nombre: 'ALUMNO', descripcion: 'Alumno de la institución' },
      { nombre: 'PROFESOR', descripcion: 'Profesor de la institución' },
      { nombre: 'ADMINISTRATIVO', descripcion: 'Personal administrativo' }
    ];

    for (const rol of roles) {
      const existing = await prisma.rol.findUnique({
        where: { nombre: rol.nombre }
      });

      if (!existing) {
        await prisma.rol.create({
          data: rol
        });
        console.log(`✅ Rol creado: ${rol.nombre}`);
      } else {
        console.log(`ℹ️ Rol ya existe: ${rol.nombre}`);
      }
    }

    console.log('✅ Roles inicializados correctamente');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initRoles();