import { prisma } from '../config/prisma.js';
import type { TipoCalificacion } from '@prisma/client';

interface FilaCalificacion {
  idAlumno: number;
  tipoCalificacion: TipoCalificacion;
  numero: number;
  nota: number;
  observacion?: string | null;
}

class CalificacionRepository {
  async upsertLote(cursadaId: number, filas: FilaCalificacion[]) {
    const operaciones = filas.map(fila =>
      prisma.calificacion.upsert({
        where: {
          cursadaId_alumnoId_tipoCalificacion_numero: {
            cursadaId,
            alumnoId: fila.idAlumno,
            tipoCalificacion: fila.tipoCalificacion,
            numero: fila.numero
          }
        },
        create: {
          cursadaId,
          alumnoId: fila.idAlumno,
          tipoCalificacion: fila.tipoCalificacion,
          numero: fila.numero,
          nota: fila.nota,
          observacion: fila.observacion ?? null
        },
        update: {
          nota: fila.nota,
          observacion: fila.observacion ?? null
        }
      })
    );

    return await prisma.$transaction(operaciones);
  }

  async findByCursada(cursadaId: number, tipo?: TipoCalificacion, alumnoIdFiltro?: number) {
    return await prisma.calificacion.findMany({
      where: {
        cursadaId,
        ...(tipo ? { tipoCalificacion: tipo } : {}),
        ...(alumnoIdFiltro ? { alumnoId: alumnoIdFiltro } : {})
      },
      include: {
        alumno: {
          include: {
            usuario: {
              select: { idUsuario: true, apellidoNombre: true, dni: true }
            }
          }
        }
      },
      orderBy: [{ alumnoId: 'asc' }, { tipoCalificacion: 'asc' }, { numero: 'asc' }]
    });
  }

  async findByAlumno(idAlumno: number) {
    return await prisma.calificacion.findMany({
      where: { alumnoId: idAlumno },
      include: {
        cursada: {
          include: {
            materia: {
              select: { id: true, nombre: true, notaMinima: true }
            }
          }
        }
      },
      orderBy: { fechaRegistro: 'desc' }
    });
  }

  async findAllByCursadaSimple(cursadaId: number) {
    return await prisma.calificacion.findMany({
      where: { cursadaId },
      select: {
        alumnoId: true,
        tipoCalificacion: true,
        numero: true,
        nota: true
      }
    });
  }

  async getInscriptosActivosByCursada(cursadaId: number) {
    return await prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        estado: { not: 'BAJA' }
      },
      select: {
        alumnoId: true,
        alumno: { select: { idCuenta: true } }
      }
    });
  }

  async isAlumnoInscripto(cursadaId: number, idAlumno: number): Promise<boolean> {
    const inscripcion = await prisma.inscripcionMateria.findFirst({
      where: {
        cursadaId,
        alumnoId: idAlumno,
        estado: { not: 'BAJA' }
      }
    });
    return inscripcion !== null;
  }
}

export default new CalificacionRepository();
