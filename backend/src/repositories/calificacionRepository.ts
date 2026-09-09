import { prisma } from '../config/prisma.js';
import type { TipoCalificacion } from '@prisma/client';
import type { FilaCalificacionPreparada } from '../domain/academico/calificaciones.js';

type FilaCalificacion = FilaCalificacionPreparada;

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
          fechaEvaluacion: fila.fechaEvaluacion ?? null,
          parcialOriginalId: fila.parcialOriginalId ?? null,
          observacion: fila.observacion ?? null
        },
        update: {
          nota: fila.nota,
          fechaEvaluacion: fila.fechaEvaluacion ?? null,
          parcialOriginalId: fila.parcialOriginalId ?? null,
          observacion: fila.observacion ?? null
        }
      })
    );

    return await prisma.$transaction(operaciones);
  }

  async findByCursada(
    cursadaId: number,
    tipo?: TipoCalificacion,
    alumnoIdFiltro?: number,
    numero?: number
  ) {
    return await prisma.calificacion.findMany({
      where: {
        cursadaId,
        ...(tipo ? { tipoCalificacion: tipo } : {}),
        ...(alumnoIdFiltro ? { alumnoId: alumnoIdFiltro } : {}),
        ...(numero ? { numero } : {})
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
        id: true,
        alumnoId: true,
        tipoCalificacion: true,
        numero: true,
        nota: true,
        parcialOriginalId: true
      }
    });
  }

  async findParcialesByIds(ids: number[]) {
    return await prisma.calificacion.findMany({
      where: { id: { in: ids }, tipoCalificacion: 'PARCIAL' },
      select: {
        id: true,
        cursadaId: true,
        alumnoId: true,
        tipoCalificacion: true,
        numero: true
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
        alumno: {
          select: {
            idCuenta: true,
            usuario: { select: { idUsuario: true, apellidoNombre: true, dni: true } }
          }
        }
      }
    });
  }

  async findInscripcionesByCursada(cursadaId: number, alumnoIds: number[]) {
    if (alumnoIds.length === 0) return [];

    return prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        alumnoId: { in: alumnoIds },
        estado: { not: 'BAJA' }
      },
      select: { alumnoId: true }
    });
  }

}

export default new CalificacionRepository();
