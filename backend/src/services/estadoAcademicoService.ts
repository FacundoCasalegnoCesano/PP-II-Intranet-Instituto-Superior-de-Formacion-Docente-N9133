import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import calificacionRepository from '../repositories/calificacionRepository.js';
import asistenciaRepository from '../repositories/asistenciaRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { verificarPermisoCursada } from '../utils/docenteHelper.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';
import type { Cursada } from '@prisma/client';
import {
  MINIMO_CON_JUSTIFICACION,
  umbralAsistencia,
  umbralTpsRegularizar,
  permiteFlexionJustificadas,
  aniosValidezRegularidad
} from '../utils/reglasAcademicas.js';

type Estado = 'EN_CURSO' | 'REGULAR' | 'HABILITADO_PROMOCION' | 'PROMOCIONADO' | 'LIBRE';

class EstadoAcademicoService {
  /**
   * Calcula el estado de UN alumno en UNA cursada a partir de
   * calificaciones + asistencias ya registradas.
   */
  private calcularFila(
    alumnoUsuarioId: number,
    idAlumno: number,
    cursada: Cursada,
    materia: any,
    califs: Array<{ alumnoId: number; tipoCalificacion: string; numero: number; nota: number }>,
    asists: Array<{ alumnoId: number; fecha: Date; presente: boolean; justificado: boolean }>
  ) {
    const notaMinima = materia.notaMinima ?? 6;
    const notaPromocion = materia.notaPromocion ?? 8;
    const asistenciaRequerida = umbralAsistencia(materia);
    const tpRequeridos = umbralTpsRegularizar(materia);

    const califsAlu = califs.filter(c => c.alumnoId === idAlumno);
    const asistsAlu = asists.filter(a => a.alumnoId === idAlumno);

    // --- Parciales efectivos (recuperatorio N reemplaza parcial N) ---
    const parciales = califsAlu.filter(c => c.tipoCalificacion === 'PARCIAL');
    const recups = new Map(
      califsAlu.filter(c => c.tipoCalificacion === 'RECUPERATORIO').map(c => [c.numero, c.nota])
    );
    const parcialesEfectivos = parciales.map(p => ({
      numero: p.numero,
      notaOriginal: p.nota,
      notaEfectiva: recups.get(p.numero) ?? p.nota,
      recuperado: recups.has(p.numero)
    }));

    const promedio =
      parcialesEfectivos.length > 0
        ? Number((
            parcialesEfectivos.reduce((acc, p) => acc + p.notaEfectiva, 0) /
            parcialesEfectivos.length
          ).toFixed(2))
        : null;

    // --- Asistencia (Art. 28 RAI) ---
    const fechasTotales = new Set(asists.map(a => a.fecha.toISOString().slice(0, 10)));
    const totalClases = fechasTotales.size;
    const presentes = asistsAlu.filter(a => a.presente).length;
    const justificados = asistsAlu.filter(a => !a.presente && a.justificado).length;
    const injustificados = asistsAlu.filter(a => !a.presente && !a.justificado).length;
    const porcentajeAsistencia =
      totalClases > 0 && asistsAlu.length > 0
        ? Number(((presentes / totalClases) * 100).toFixed(2))
        : null;

    // Regularidad (Art. 28): >= requerido, o >= 50% con todas las ausencias
    // justificadas — EXCEPTO Talleres de Práctica (tabla institucional)
    const flexAplica = permiteFlexionJustificadas(materia);
    const cumpleAsistencia =
      porcentajeAsistencia === null
        ? null
        : porcentajeAsistencia >= asistenciaRequerida ||
          (flexAplica && porcentajeAsistencia >= MINIMO_CON_JUSTIFICACION && injustificados === 0);

    // La promoción directa exige el % completo, sin la flexión del 50% (Art. 37a)
    const cumpleAsistenciaParaPromocion =
      porcentajeAsistencia === null ? null : porcentajeAsistencia >= asistenciaRequerida;

    // --- TPs ---
    const tps = califsAlu.filter(c => c.tipoCalificacion === 'TRABAJO_PRACTICO');
    const tpsAprobados = tps.filter(t => t.nota >= notaMinima).length;
    const porcentajeTps =
      tps.length > 0 ? Number(((tpsAprobados / tps.length) * 100).toFixed(2)) : null;
    const cumpleTps = porcentajeTps === null ? null : porcentajeTps >= tpRequeridos;

    // --- Examen Final / Promoción (coloquio integrador) ---
    const examenFinalNota = califsAlu.find(c => c.tipoCalificacion === 'EXAMEN_FINAL')?.nota ?? null;

    // --- Estado (Arts. 28, 31, 35, 37 RAI + Tabla Dimension Pedagógica) ---
    let estado: Estado = 'EN_CURSO';

    const parcialesOk = parcialesEfectivos.length > 0 &&
      parcialesEfectivos.every(p => p.notaEfectiva >= notaMinima);
    const tpsOk = cumpleTps !== false;
    const promedioAlcanzaPromocion = promedio !== null && promedio >= notaPromocion;

    // Parciales originales para promo directa: deben ser >= notaPromocion SIN recuperatorio
    // (usa `parciales` ya filtrado arriba: notas de primera instancia)
    const parcialesOkOriginales = parciales.length > 0 &&
      parciales.every(p => p.nota >= notaPromocion);

    // Promoción directa: solo si materia.esPromocionable=true y requisitos estrictos
    const puedePromocionDirecta =
      materia.esPromocionable === true &&
      parcialesOkOriginales &&
      cumpleTps === true &&                    // 100% TPs aprobados
      cumpleAsistenciaParaPromocion !== false; // 75% estricto (sin flexión 50%)

    if (cumpleAsistencia === false) {
      // Art. 28: no alcanza ni el 75% ni el 50% con justificación completa
      estado = 'LIBRE';
    } else if (!parcialesOk || !tpsOk) {
      // Faltan definiciones del ciclo → sigue cursando
      estado = 'EN_CURSO';
    } else {
      // Parciales aprobados + TPs ok → al menos REGULAR (promueve con final, Art. 35)
      if (puedePromocionDirecta) {
        if (examenFinalNota === null) {
          // Pendiente la instancia final integradora (Art. 37d)
          estado = 'HABILITADO_PROMOCION';
        } else if (examenFinalNota >= notaPromocion) {
          // Integradora >= 8 → promoción directa sin examen final
          estado = 'PROMOCIONADO';
        } else {
          // Integradora insuficiente → cae a examen final como regular
          estado = 'REGULAR';
        }
      } else {
        estado = 'REGULAR';
      }
    }

    // Art. 32 RAI: regularidad vence a los ANIOS_VALIDEZ_REGULARIDAD de la cursada.
    // Un REGULAR con plazo vencido queda LIBRE (o debe recursar).
    const regularHasta = new Date(
      cursada.anioLectivo + aniosValidezRegularidad(materia),
      11,
      31
    );
    const regularidadVencida = new Date() > regularHasta;
    if (estado === 'REGULAR' && regularidadVencida) {
      estado = 'LIBRE';
    }

    return {
      alumnoUsuarioId,
      estado,
      regularHasta: regularHasta.toISOString().slice(0, 10),
      regularidadVencida,
      parcialesEfectivos,
      promedio,
      cumpleNotaMinima:
        promedio === null
          ? null
          : promedio >= notaMinima &&
            parcialesEfectivos.every(p => p.notaEfectiva >= notaMinima),
      examenFinalNota,
      asistencia: {
        totalClases,
        presentes,
        ausentesJustificados: justificados,
        ausentesInjustificados: injustificados,
        porcentaje: porcentajeAsistencia,
        requerido: asistenciaRequerida,
        minimoConTodasJustificadas: MINIMO_CON_JUSTIFICACION,
        todasAusenciasJustificadas: injustificados === 0,
        cumpleRegularidad: cumpleAsistencia,
        cumpleParaPromocion: cumpleAsistenciaParaPromocion
      },
      tps: {
        cargados: tps.length,
        aprobados: tpsAprobados,
        porcentaje: porcentajeTps,
        requerido: tpRequeridos,
        cumple: cumpleTps
      }
    };
  }

  /**
   * Listado de estados de todos los inscriptos a una materia
   * (admin: cualquier materia; profesor: solo sus asignadas).
   */
  async getResumenPorMateria(materiaId: number, currentUser: any, cicloLectivo?: number) {
    const ciclo = cicloLectivo ?? new Date().getFullYear();

    const cursada = await cursadaRepository.getCursadaActivaByMateria(materiaId, ciclo);
    if (!cursada) {
      throw new AppError(404, `No hay cursada activa para esta materia en ${ciclo}`);
    }

    // Valida admin o profesor asignado a ESA cursada
    await verificarPermisoCursada(currentUser, cursada.id);

    const materia = (await materiaRepository.findById(materiaId))!;

    const [inscriptos, califs, asists] = await Promise.all([
      calificacionRepository.getInscriptosActivosByCursada(cursada.id),
      calificacionRepository.findAllByCursadaSimple(cursada.id),
      asistenciaRepository.findAllByCursadaSimple(cursada.id)
    ]);

    const filas = inscriptos.map(ins =>
      this.calcularFila(ins.alumno.idCuenta, ins.alumnoId, cursada as any, materia, califs, asists)
    );

    return {
      materia: { id: materia.id, nombre: materia.nombre },
      cursadaId: cursada.id,
      anioLectivo: cursada.anioLectivo,
      periodo: cursada.periodo,
      alumnos: filas
    };
  }

  /**
   * Estados de TODAS las materias activas de un alumno.
   * El alumno solo puede verse a sí mismo; admin y profesor pueden consultar.
   */
  async getEstadoAlumno(alumnoUsuarioId: number, currentUser: any) {
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tu propio estado académico');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);

    // Inscripciones activas con su cursada vinculada
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId: idAlumno,
        estado: { not: 'BAJA' }
      },
      include: {
        cursada: {
          include: {
            materia: true,
            calificaciones: true,
            asistencias: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const materias = [];
    for (const ins of inscripciones) {
      if (!ins.cursada || !ins.cursada.activo) continue;

      const materia = ins.cursada.materia;

      materias.push({
        materia: { id: materia.id, nombre: materia.nombre },
        cicloLectivo: ins.cicloLectivo,
        modalidadElegida: ins.modalidadElegida,
        ...(this.calcularFila(
          alumnoUsuarioId,
          idAlumno,
          ins.cursada as any,
          materia,
          ins.cursada.calificaciones,
          ins.cursada.asistencias
        ) as any)
      });
    }

    return { alumnoUsuarioId, materias };
  }

  /**
   * Indica si el alumno conserva la regularidad para rendir una materia.
   * Incluye cursadas historicas aunque ya no esten activas.
   */
  async tieneRegularidadVigente(idAlumno: number, materiaId: number): Promise<boolean> {
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId: idAlumno,
        materiaId,
        estado: { not: 'BAJA' }
      },
      include: {
        materia: true,
        cursada: {
          include: {
            calificaciones: true,
            asistencias: true
          }
        }
      },
      orderBy: { cicloLectivo: 'desc' }
    });

    for (const inscripcion of inscripciones) {
      if (!inscripcion.cursada) continue;

      const fila = this.calcularFila(
        idAlumno,
        idAlumno,
        inscripcion.cursada as any,
        inscripcion.materia,
        inscripcion.cursada.calificaciones,
        inscripcion.cursada.asistencias
      );

      if (fila.estado === 'REGULAR' || fila.estado === 'HABILITADO_PROMOCION') {
        return true;
      }
    }

    return false;
  }

  /**
   * Mapa materiaId → mejor estado derivado del alumno (Art. 32 y régimen de
   * correlatividades). Una materia está REGULARIZADA si su mejor estado es
   * REGULAR, HABILITADO_PROMOCION o PROMOCIONADO.
   */
  async getMapaEstadosPorMateria(idAlumno: number): Promise<Map<number, Estado>> {
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: { alumnoId: idAlumno, estado: { not: 'BAJA' } },
      include: {
        cursada: {
          include: {
            materia: true,
            calificaciones: true,
            asistencias: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapa = new Map<number, Estado>();
    for (const ins of inscripciones) {
      if (!ins.cursada || !ins.cursada.activo) continue;
      const materia = ins.cursada.materia;

      // Re-evaluar sin la expiración (un REGULAR vencido sigue siendo
      // trayectoria válida a efectos de correlatividad de cursado)
      const fila = this.calcularFila(
        idAlumno,
        ins.alumnoId,
        ins.cursada as any,
        materia,
        ins.cursada.calificaciones,
        ins.cursada.asistencias
      );

      const previo = mapa.get(materia.id);
      if (!previo || this.rangoEstado(fila.estado) > this.rangoEstado(previo)) {
        mapa.set(materia.id, fila.estado);
      }
    }
    return mapa;
  }

  /**
   * Set de materiaId que el alumno tiene APROBADAS: por examen final
   * aprobado ante tribunal, por promoción directa (COLOQUIO >= 8,
   * Art. 37d) o por homologación aprobada (Arts. 50-53).
   */
  async getMateriasAprobadasSet(
    idAlumno: number,
    mapaExistente?: Map<number, Estado>
  ): Promise<Set<number>> {
    const aprobadas = new Set<number>();

    // 1) Exámenes finales aprobados
    const examenes = await prisma.inscripcionExamen.findMany({
      where: { alumnoId: idAlumno, aprobado: true },
      include: { mesa: { select: { materiaId: true } } }
    });
    for (const e of examenes) aprobadas.add(e.mesa.materiaId);

    // 2) Homologaciones aprobadas
    const homologaciones = await prisma.homologacion.findMany({
      where: { alumnoId: idAlumno, estado: 'APROBADA' },
      select: { materiaId: true }
    });
    for (const h of homologaciones) aprobadas.add(h.materiaId);

    // 3) Promoción directa: mejor estado PROMOCIONADO
    const mapa = mapaExistente ?? await this.getMapaEstadosPorMateria(idAlumno);
    for (const [materiaId, estado] of mapa) {
      if (estado === 'PROMOCIONADO') aprobadas.add(materiaId);
    }

    return aprobadas;
  }

  private rangoEstado(estado: Estado): number {
    const orden: Record<Estado, number> = {
      LIBRE: 0,
      EN_CURSO: 1,
      REGULAR: 2,
      HABILITADO_PROMOCION: 3,
      PROMOCIONADO: 4
    };
    return orden[estado];
  }

  /**
   * Art. 61 RAI — Promedio General de la carrera: suma de todas las
   * calificaciones FINALES de las Unidades Curriculares aprobadas dividido
   * por el total de ellas. No se toman promedios parciales ni aplazos.
   *
   * La nota definitiva de cada materia proviene de (en orden de prioridad):
   * 1. Examen final aprobado ante tribunal (notaFinal)
   * 2. Homologación aprobada (calificación)
   * 3. Promoción directa (nota de la instancia final integradora / COLOQUIO)
   */
  async getPromedioGeneral(
    alumnoUsuarioId: number,
    currentUser: any,
    carreraId?: number
  ) {
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tu propio promedio');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);

    type Definitiva = {
      materiaId: number;
      carreraId: number;
      nombre: string;
      nota: number;
      via: 'EXAMEN_FINAL' | 'HOMOLOGACION' | 'PROMOCION_DIRECTA';
    };
    const definitivas = new Map<number, Definitiva>();

    // 1) Exámenes finales aprobados (último registro por materia)
    const examenes = await prisma.inscripcionExamen.findMany({
      where: { alumnoId: idAlumno, aprobado: true, notaFinal: { not: null } },
      include: {
        mesa: {
          include: { materia: { select: { id: true, nombre: true, carreraId: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    for (const e of examenes) {
      const m = e.mesa.materia;
      if (!definitivas.has(m.id) && e.notaFinal !== null) {
        definitivas.set(m.id, {
          materiaId: m.id,
          carreraId: m.carreraId,
          nombre: m.nombre,
          nota: e.notaFinal,
          via: 'EXAMEN_FINAL'
        });
      }
    }

    // 2) Homologaciones aprobadas
    const homologaciones = await prisma.homologacion.findMany({
      where: { alumnoId: idAlumno, estado: 'APROBADA' },
      include: { materia: { select: { id: true, nombre: true, carreraId: true } } }
    });
    for (const h of homologaciones) {
      const m = h.materia;
      if (!definitivas.has(m.id)) {
        definitivas.set(m.id, {
          materiaId: m.id,
          carreraId: m.carreraId,
          nombre: m.nombre,
          nota: h.calificacion,
          via: 'HOMOLOGACION'
        });
      }
    }

    // 3) Promoción directa: estado PROMOCIONADO → nota de la integradora
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: { alumnoId: idAlumno, estado: { not: 'BAJA' } },
      include: {
        cursada: {
          include: {
            materia: true,
            calificaciones: true,
            asistencias: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    for (const ins of inscripciones) {
      if (!ins.cursada?.activo || definitivas.has(ins.cursada.materiaId)) continue;

      const materia = ins.cursada.materia;

      const fila = this.calcularFila(
        alumnoUsuarioId,
        idAlumno,
        ins.cursada as any,
        materia,
        ins.cursada.calificaciones,
        ins.cursada.asistencias
      );
      if (fila.estado === 'PROMOCIONADO' && fila.examenFinalNota !== null) {
        definitivas.set(materia.id, {
          materiaId: materia.id,
          carreraId: materia.carreraId,
          nombre: materia.nombre,
          nota: fila.examenFinalNota,
          via: 'PROMOCION_DIRECTA'
        });
      }
    }

    // Filtrar por carrera si se indica
    let materiasFinales = Array.from(definitivas.values());
    if (carreraId) {
      materiasFinales = materiasFinales.filter(m => m.carreraId === carreraId);
    }

    const cantidad = materiasFinales.length;
    const promedioGeneral =
      cantidad > 0
        ? Number((materiasFinales.reduce((acc, m) => acc + m.nota, 0) / cantidad).toFixed(2))
        : null;

    return {
      alumnoUsuarioId,
      ...(carreraId ? { carreraId } : {}),
      promedioGeneral,
      cantidadMateriasAprobadas: cantidad,
      materias: materiasFinales.map(({ materiaId, nombre, nota, via }) => ({
        materiaId,
        nombre,
        nota,
        via
      }))
    };
  }

  /**
   * ¿El estado alcanzado cuenta como REGULARIZADO para cursar correlativas?
   * (Régimen de correlatividades: "para cursar debe tener regularizado")
   */
  esRegularizado(estado: Estado | undefined): boolean {
    return (
      estado === 'REGULAR' ||
      estado === 'HABILITADO_PROMOCION' ||
      estado === 'PROMOCIONADO'
    );
  }
}

export default new EstadoAcademicoService();
