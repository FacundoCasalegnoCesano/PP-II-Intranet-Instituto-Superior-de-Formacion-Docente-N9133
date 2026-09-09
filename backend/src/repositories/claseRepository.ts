import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';

export interface ClaseAsistenciaPersistida {
  idAlumno: number;
  presente: boolean;
  justificado: boolean;
  observacion: string | null;
}

export interface SaveClaseInput {
  cursadaId: number;
  materiaId: number;
  fecha: Date;
  temaDesarrollado: string;
  filas: ClaseAsistenciaPersistida[];
}

const alumnoPublicoSelect = {
  idAlumno: true,
  usuario: {
    select: {
      idUsuario: true,
      apellidoNombre: true,
      dni: true
    }
  }
} as const;

class ClaseRepository {
  async findCursada(cursadaId: number) {
    return await prisma.cursada.findUnique({
      where: { id: cursadaId },
      select: {
        id: true,
        materiaId: true,
        anioLectivo: true,
        activo: true,
        docenteId: true
      }
    });
  }

  async findActiveEnrollments(cursadaId: number) {
    const rows = await prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        estado: { not: 'BAJA' },
        fechaBaja: null
      },
      select: {
        alumno: { select: alumnoPublicoSelect }
      },
      orderBy: { fechaInscripcion: 'asc' }
    });

    return rows.map(row => ({
      idAlumno: row.alumno.idAlumno,
      usuarioId: row.alumno.usuario.idUsuario,
      apellidoNombre: row.alumno.usuario.apellidoNombre,
      dni: row.alumno.usuario.dni
    }));
  }

  async findHistory(cursadaId: number, materiaId: number, anioLectivo: number) {
    const inicio = new Date(Date.UTC(anioLectivo, 0, 1));
    const fin = new Date(Date.UTC(anioLectivo + 1, 0, 1));
    const [libros, asistencias] = await Promise.all([
      prisma.libroDeTema.findMany({
        where: { materiaId, fecha: { gte: inicio, lt: fin } },
        select: { fecha: true, temaDesarrollado: true },
        orderBy: { fecha: 'desc' }
      }),
      prisma.asistencia.findMany({
        where: { cursadaId, fecha: { gte: inicio, lt: fin } },
        select: { fecha: true, presente: true, justificado: true }
      })
    ]);

    const asistenciaPorFecha = new Map<string, typeof asistencias>();
    for (const asistencia of asistencias) {
      const fecha = asistencia.fecha.toISOString().slice(0, 10);
      const actuales = asistenciaPorFecha.get(fecha) ?? [];
      actuales.push(asistencia);
      asistenciaPorFecha.set(fecha, actuales);
    }

    const fechasLibro = new Set<string>();
    for (const libro of libros) {
      const fecha = libro.fecha.toISOString().slice(0, 10);
      if (fechasLibro.has(fecha)) {
        throw new AppError(409, 'Existen registros duplicados del libro de temas para esta fecha');
      }
      fechasLibro.add(fecha);
    }

    return libros.map(libro => {
      const fecha = libro.fecha.toISOString().slice(0, 10);
      const filas = asistenciaPorFecha.get(fecha) ?? [];
      return {
        fecha,
        temaDesarrollado: libro.temaDesarrollado,
        presentes: filas.filter(fila => fila.presente).length,
        ausentes: filas.filter(fila => !fila.presente).length,
        ausentesJustificados: filas.filter(fila => !fila.presente && fila.justificado).length
      };
    });
  }

  async findDetail(cursadaId: number, materiaId: number, fecha: Date) {
    const [libros, asistencias] = await Promise.all([
      prisma.libroDeTema.findMany({
        where: { materiaId, fecha },
        select: { fecha: true, temaDesarrollado: true }
      }),
      prisma.asistencia.findMany({
        where: { cursadaId, fecha },
        select: {
          presente: true,
          justificado: true,
          observacion: true,
          alumno: { select: alumnoPublicoSelect }
        },
        orderBy: { alumnoId: 'asc' }
      })
    ]);

    if (libros.length === 0) return null;
    if (libros.length > 1) {
      throw new AppError(409, 'Existen registros duplicados del libro de temas para esta fecha');
    }

    return {
      fecha: fecha.toISOString().slice(0, 10),
      temaDesarrollado: libros[0]?.temaDesarrollado ?? '',
      asistencias: asistencias.map(asistencia => ({
        alumnoId: asistencia.alumno.usuario.idUsuario,
        nombre: asistencia.alumno.usuario.apellidoNombre,
        dni: asistencia.alumno.usuario.dni,
        presente: asistencia.presente,
        justificado: asistencia.justificado,
        observacion: asistencia.observacion
      }))
    };
  }

  async saveAtomic(input: SaveClaseInput) {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Sin UNIQUE(materia_id, fecha) —pendiente hasta resolver duplicados
      // históricos— el lock de la materia serializa el check-then-create.
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM materias WHERE id = ${input.materiaId} FOR UPDATE
      `;

      const libros = await tx.libroDeTema.findMany({
        where: { materiaId: input.materiaId, fecha: input.fecha },
        select: { idLibroDeTema: true }
      });
      if (libros.length > 1) {
        throw new AppError(409, 'Existen registros duplicados del libro de temas para esta fecha');
      }

      const libro = libros[0]
        ? await tx.libroDeTema.update({
            where: { idLibroDeTema: libros[0].idLibroDeTema },
            data: { temaDesarrollado: input.temaDesarrollado }
          })
        : await tx.libroDeTema.create({
            data: {
              materiaId: input.materiaId,
              fecha: input.fecha,
              temaDesarrollado: input.temaDesarrollado
            }
          });

      await Promise.all(input.filas.map(fila => tx.asistencia.upsert({
        where: {
          cursadaId_alumnoId_fecha: {
            cursadaId: input.cursadaId,
            alumnoId: fila.idAlumno,
            fecha: input.fecha
          }
        },
        create: {
          cursadaId: input.cursadaId,
          alumnoId: fila.idAlumno,
          fecha: input.fecha,
          presente: fila.presente,
          justificado: fila.justificado,
          observacion: fila.observacion
        },
        update: {
          presente: fila.presente,
          justificado: fila.justificado,
          observacion: fila.observacion
        }
      })));

      return libro;
    });
  }

  async deleteAtomic(cursadaId: number, materiaId: number, fecha: Date) {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const libros = await tx.libroDeTema.findMany({
        where: { materiaId, fecha },
        select: { idLibroDeTema: true }
      });
      if (libros.length > 1) {
        throw new AppError(409, 'Existen registros duplicados del libro de temas para esta fecha');
      }

      const asistencias = await tx.asistencia.deleteMany({ where: { cursadaId, fecha } });
      if (libros[0]) {
        await tx.libroDeTema.delete({ where: { idLibroDeTema: libros[0].idLibroDeTema } });
      }
      return { asistencias: asistencias.count, tema: libros.length };
    });
  }
}

export default new ClaseRepository();
