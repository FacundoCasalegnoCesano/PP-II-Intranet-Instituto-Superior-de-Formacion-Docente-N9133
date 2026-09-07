import { prisma } from '../config/prisma.js';

export interface AlumnoData {
  domicilio?: string | null;
  institucionProcedencia?: string | null;
  adeudaMateria?: boolean;
  anioEgreso?: number | null;
}

class AlumnoRepository {
  // Crea la fila de alumno si no existe, o la actualiza si ya existe (1:1 con usuario)
  async upsertByUsuarioId(usuarioId: number, data: AlumnoData) {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) {
        delete cleanData[key];
      }
    });

    const existing = await prisma.alumno.findUnique({ where: { idCuenta: usuarioId } });
    if (existing) {
      return prisma.alumno.update({
        where: { idCuenta: usuarioId },
        data: cleanData
      });
    }
    return prisma.alumno.create({
      data: { idCuenta: usuarioId, ...cleanData }
    });
  }

  async findByUsuarioId(usuarioId: number) {
    return prisma.alumno.findUnique({ where: { idCuenta: usuarioId } });
  }

  async findByUsuarioIds(usuarioIds: number[]) {
    if (usuarioIds.length === 0) return [];

    return prisma.alumno.findMany({
      where: { idCuenta: { in: usuarioIds } },
      select: { idCuenta: true, idAlumno: true }
    });
  }

  // Solo elimina los datos específicos del alumno; la cuenta de usuario permanece
  async deleteByUsuarioId(usuarioId: number) {
    return prisma.alumno.deleteMany({ where: { idCuenta: usuarioId } });
  }

  async findById(idAlumno: number) {
    return prisma.alumno.findUnique({
      where: { idAlumno },
      include: {
        usuario: true
      }
    });
  }
}

export default new AlumnoRepository();
