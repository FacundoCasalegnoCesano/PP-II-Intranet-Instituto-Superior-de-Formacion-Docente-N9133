import { prisma } from '../config/prisma.js';

class ProfesorMateriaRepository {
  async findByProfesorAndMateria(profesorId: number, materiaId: number) {
    return await prisma.profesorMateria.findUnique({
      where: {
        profesorId_materiaId: { profesorId, materiaId }
      }
    });
  }

  async asignar(profesorId: number, materiaId: number) {
    const existing = await this.findByProfesorAndMateria(profesorId, materiaId);

    // Si existe una asignación dada de baja, se reactiva (constraint única)
    if (existing) {
      return await prisma.profesorMateria.update({
        where: { id: existing.id },
        data: {
          activo: true,
          fechaBaja: null,
          fechaAsignacion: new Date()
        }
      });
    }

    return await prisma.profesorMateria.create({
      data: { profesorId, materiaId }
    });
  }

  async desasignar(profesorId: number, materiaId: number) {
    return await prisma.profesorMateria.updateMany({
      where: {
        profesorId,
        materiaId,
        activo: true,
        fechaBaja: null
      },
      data: {
        activo: false,
        fechaBaja: new Date()
      }
    });
  }

  async findByMateria(materiaId: number) {
    return await prisma.profesorMateria.findMany({
      where: {
        materiaId,
        activo: true,
        fechaBaja: null
      },
      include: {
        profesor: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        }
      },
      orderBy: { fechaAsignacion: 'desc' }
    });
  }
}

export default new ProfesorMateriaRepository();