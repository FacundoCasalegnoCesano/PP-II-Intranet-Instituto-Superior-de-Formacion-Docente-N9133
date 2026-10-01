import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput, type PaginatedResult } from '../utils/pagination.js';

interface FilaUpsert {
  idAlumno: number;
  presente: boolean;
  justificado?: boolean;
  observacion?: string | null;
}

class AsistenciaRepository {
  async findInscripcionesByCursadaAndAlumnoIds(cursadaId: number, alumnoIds: number[]) {
    if (alumnoIds.length === 0) return [];
    return prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        estado: { not: 'BAJA' },
        alumnoId: { in: alumnoIds }
      },
      select: { alumnoId: true }
    });
  }

  /**
   * Carga/actualiza asistencias de una clase (upsert por alumno+fecha).
   */
  async upsertClase(cursadaId: number, fecha: Date, filas: FilaUpsert[]) {
    const filasOrdenadas = [...filas].sort((a, b) => a.idAlumno - b.idAlumno);
    for (let intento = 0; ; intento += 1) {
      const operaciones = filasOrdenadas.map(fila =>
        prisma.asistencia.upsert({
          where: {
            cursadaId_alumnoId_fecha: {
              cursadaId,
              alumnoId: fila.idAlumno,
              fecha
            }
          },
          create: {
            cursadaId,
            alumnoId: fila.idAlumno,
            fecha,
            presente: fila.presente,
            justificado: fila.justificado ?? false,
            observacion: fila.observacion ?? null
          },
          update: {
            presente: fila.presente,
            justificado: fila.justificado ?? false,
            observacion: fila.observacion ?? null
          }
        })
      );

      try {
        return await prisma.$transaction(operaciones);
      } catch (error) {
        // MySQL/MariaDB uses Prisma's read-then-write upsert path; retry only this batch's unique-key race.
        if (intento >= 2 || !esConflictoUnicoAsistencia(error)) throw error;
      }
    }
  }

  async findByCursada(cursadaId: number, fecha?: Date) {
    return await prisma.asistencia.findMany({
      where: {
        cursadaId,
        ...(fecha ? { fecha } : {})
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
      orderBy: [{ fecha: 'desc' }, { alumnoId: 'asc' }]
    });
  }

  async findByAlumno(idAlumno: number) {
    return await prisma.asistencia.findMany({
      where: { alumnoId: idAlumno },
      include: {
        cursada: {
          include: {
            materia: {
              select: { id: true, nombre: true }
            }
          }
        }
      },
      orderBy: { fecha: 'desc' }
    });
  }

  async findAlumnoCursada(idAlumno: number, cursadaId: number) {
    return prisma.inscripcionMateria.findFirst({
      where: { alumnoId: idAlumno, cursadaId },
      select: {
        id: true,
        cursada: {
          select: {
            id: true,
            materia: { select: { id: true, nombre: true, carreraId: true } }
          }
        }
      }
    });
  }

  async findDetailByAlumno(
    idAlumno: number,
    cursadaId: number,
    pagination: PaginationInput = {}
  ): Promise<PaginatedResult<{
    cursadaId: number;
    materia: { id: number; nombre: string };
    anioLectivo: number;
    periodo: string;
    fecha: string;
    presente: boolean;
    justificado: boolean;
  }>> {
    const { page, limit, skip } = normalizePagination(pagination);
    const where = { alumnoId: idAlumno, cursadaId };
    const [rows, total] = await Promise.all([
      prisma.asistencia.findMany({
        where,
        select: {
          fecha: true,
          presente: true,
          justificado: true,
          cursada: {
            select: {
              id: true,
              anioLectivo: true,
              periodo: true,
              materia: { select: { id: true, nombre: true } }
            }
          }
        },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip,
        take: limit
      }),
      prisma.asistencia.count({ where })
    ]);
    return paginated(rows.map((row) => ({
      cursadaId: row.cursada.id,
      materia: row.cursada.materia,
      anioLectivo: row.cursada.anioLectivo,
      periodo: row.cursada.periodo,
      fecha: row.fecha.toISOString().slice(0, 10),
      presente: row.presente,
      justificado: row.justificado
    })), total, page, limit);
  }

  async findAllByCursadaSimple(cursadaId: number) {
    return await prisma.asistencia.findMany({
      where: { cursadaId },
      select: {
        alumnoId: true,
        fecha: true,
        presente: true,
        justificado: true
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
        alumnoId: true
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

function esConflictoUnicoAsistencia(error: unknown): boolean {
  const prismaError = error as { code?: string; meta?: { target?: string | string[] } };
  const target = prismaError?.meta?.target;
  return prismaError?.code === 'P2002' && (
    target === 'asistencias_cursada_id_alumno_id_fecha_key' ||
    (Array.isArray(target) && target.length === 3 &&
      ['cursada_id', 'alumno_id', 'fecha'].every(field => target.includes(field)))
  );
}

export default new AsistenciaRepository();
