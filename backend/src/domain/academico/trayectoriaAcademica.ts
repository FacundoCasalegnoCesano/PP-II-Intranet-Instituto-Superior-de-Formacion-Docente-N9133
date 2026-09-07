import {
  MINIMO_CON_JUSTIFICACION,
  aniosValidezRegularidad,
  permiteFlexionJustificadas,
  umbralAsistencia,
  umbralTpsRegularizar
} from '../../utils/reglasAcademicas.js';
import {
  resumirCalificaciones,
  type CalificacionSnapshot
} from './calificaciones.js';

export type Estado =
  | 'EN_CURSO'
  | 'REGULAR'
  | 'HABILITADO_PROMOCION'
  | 'PROMOCIONADO'
  | 'LIBRE';

export interface MateriaSnapshot {
  id: number;
  nombre: string;
  notaMinima?: number | null;
  notaPromocion?: number | null;
  asistenciaRequerida?: number | null;
  tpRequeridos?: number | null;
  esPromocionable?: boolean | null;
  modalidad?: string | null;
  regimen?: string | null;
  tipoEspacio?: string | null;
  aniosRegularidad?: number | null;
  carreraId: number;
}

export interface CursadaSnapshot {
  id: number;
  materiaId: number;
  anioLectivo: number;
  periodo: string;
  activo: boolean;
}

export interface AsistenciaSnapshot {
  alumnoId: number;
  fecha: Date;
  presente: boolean;
  justificado: boolean;
}

export interface TrayectoriaSnapshot {
  alumnoUsuarioId: number;
  idAlumno: number;
  cursada: CursadaSnapshot;
  materia: MateriaSnapshot;
  calificaciones: CalificacionSnapshot[];
  asistencias: AsistenciaSnapshot[];
}

export interface ResultadoTrayectoria {
  alumnoUsuarioId: number;
  estado: Estado;
  regularHasta: string;
  regularidadVencida: boolean;
  parcialesEfectivos: ReturnType<typeof resumirCalificaciones>['parcialesEfectivos'];
  promedio: number | null;
  cumpleNotaMinima: boolean | null;
  examenFinalNota: number | null;
  asistencia: {
    totalClases: number;
    presentes: number;
    ausentesJustificados: number;
    ausentesInjustificados: number;
    porcentaje: number | null;
    requerido: number;
    minimoConTodasJustificadas: number;
    todasAusenciasJustificadas: boolean;
    cumpleRegularidad: boolean | null;
    cumpleParaPromocion: boolean | null;
  };
  tps: ReturnType<typeof resumirCalificaciones>['tps'];
}

export function evaluarCursada(
  snapshot: TrayectoriaSnapshot,
  evaluadoEn: Date
): ResultadoTrayectoria {
  const notaMinima = snapshot.materia.notaMinima ?? 6;
  const notaPromocion = snapshot.materia.notaPromocion ?? 8;
  const asistenciaRequerida = umbralAsistencia(snapshot.materia);
  const tpRequeridos = umbralTpsRegularizar(snapshot.materia);
  const calificaciones = snapshot.calificaciones.filter(
    calificacion => calificacion.alumnoId === snapshot.idAlumno
  );
  const asistencias = snapshot.asistencias.filter(
    asistencia => asistencia.alumnoId === snapshot.idAlumno
  );
  const resumen = resumirCalificaciones({
    calificaciones,
    notaMinima,
    tpRequeridos
  });

  const fechasTotales = new Set(
    snapshot.asistencias.map(asistencia => asistencia.fecha.toISOString().slice(0, 10))
  );
  const totalClases = fechasTotales.size;
  const presentes = asistencias.filter(asistencia => asistencia.presente).length;
  const justificados = asistencias.filter(
    asistencia => !asistencia.presente && asistencia.justificado
  ).length;
  const injustificados = asistencias.filter(
    asistencia => !asistencia.presente && !asistencia.justificado
  ).length;
  const porcentajeAsistencia =
    totalClases > 0 && asistencias.length > 0
      ? Number(((presentes / totalClases) * 100).toFixed(2))
      : null;
  const flexAplica = permiteFlexionJustificadas(snapshot.materia);
  const cumpleAsistencia =
    porcentajeAsistencia === null
      ? null
      : porcentajeAsistencia >= asistenciaRequerida ||
        (flexAplica &&
          porcentajeAsistencia >= MINIMO_CON_JUSTIFICACION &&
          injustificados === 0);
  const cumpleAsistenciaParaPromocion =
    porcentajeAsistencia === null ? null : porcentajeAsistencia >= asistenciaRequerida;

  const parcialesOk =
    resumen.parcialesEfectivos.length > 0 &&
    resumen.parcialesEfectivos.every(parcial => parcial.notaEfectiva >= notaMinima);
  const tpsOk = resumen.tps.cumple !== false;
  const parcialesOkParaPromocion =
    resumen.parcialesEfectivos.length > 0 &&
    resumen.parcialesEfectivos.every(parcial => parcial.notaEfectiva >= notaPromocion);
  const puedePromocionDirecta =
    snapshot.materia.esPromocionable === true &&
    parcialesOkParaPromocion &&
    resumen.tps.cumple === true &&
    cumpleAsistenciaParaPromocion !== false;

  let estado: Estado = 'EN_CURSO';
  if (cumpleAsistencia === false) {
    estado = 'LIBRE';
  } else if (!parcialesOk || !tpsOk) {
    estado = 'EN_CURSO';
  } else if (puedePromocionDirecta) {
    if (resumen.examenFinalNota === null) {
      estado = 'HABILITADO_PROMOCION';
    } else if (resumen.examenFinalNota >= notaPromocion) {
      estado = 'PROMOCIONADO';
    } else {
      estado = 'REGULAR';
    }
  } else {
    estado = 'REGULAR';
  }

  const regularHasta = new Date(
    snapshot.cursada.anioLectivo + aniosValidezRegularidad(snapshot.materia),
    11,
    31
  );
  const regularidadVencida = evaluadoEn > regularHasta;
  if (estado === 'REGULAR' && regularidadVencida) {
    estado = 'LIBRE';
  }

  return {
    alumnoUsuarioId: snapshot.alumnoUsuarioId,
    estado,
    regularHasta: regularHasta.toISOString().slice(0, 10),
    regularidadVencida,
    parcialesEfectivos: resumen.parcialesEfectivos,
    promedio: resumen.promedio,
    cumpleNotaMinima: resumen.cumpleNotaMinima,
    examenFinalNota: resumen.examenFinalNota,
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
    tps: resumen.tps
  };
}

export function consolidarTrayectoria(input: {
  evaluaciones: Array<{ materiaId: number; estado: Estado }>;
}): Map<number, Estado> {
  const resultado = new Map<number, Estado>();
  for (const evaluacion of input.evaluaciones) {
    const previo = resultado.get(evaluacion.materiaId);
    if (!previo || rangoEstado(evaluacion.estado) > rangoEstado(previo)) {
      resultado.set(evaluacion.materiaId, evaluacion.estado);
    }
  }
  return resultado;
}

export function esRegularizado(estado: Estado | undefined): boolean {
  return (
    estado === 'REGULAR' ||
    estado === 'HABILITADO_PROMOCION' ||
    estado === 'PROMOCIONADO'
  );
}

function rangoEstado(estado: Estado): number {
  const orden: Record<Estado, number> = {
    LIBRE: 0,
    EN_CURSO: 1,
    REGULAR: 2,
    HABILITADO_PROMOCION: 3,
    PROMOCIONADO: 4
  };
  return orden[estado];
}
