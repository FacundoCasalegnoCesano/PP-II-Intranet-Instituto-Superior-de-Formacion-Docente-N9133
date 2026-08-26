export interface CalificacionSnapshot {
  id: number;
  alumnoId: number;
  tipoCalificacion: string;
  numero: number;
  nota: number;
  parcialOriginalId?: number | null;
}

export interface ParcialEfectivo {
  numero: number;
  notaOriginal: number;
  notaEfectiva: number;
  recuperado: boolean;
}

export interface ResumenCalificaciones {
  parcialesEfectivos: ParcialEfectivo[];
  promedio: number | null;
  cumpleNotaMinima: boolean | null;
  examenFinalNota: number | null;
  tps: {
    cargados: number;
    aprobados: number;
    porcentaje: number | null;
    requerido: number;
    cumple: boolean | null;
  };
}

export function resumirCalificaciones(input: {
  calificaciones: CalificacionSnapshot[];
  notaMinima: number;
  tpRequeridos: number;
}): ResumenCalificaciones {
  const parciales = input.calificaciones.filter(
    calificacion => calificacion.tipoCalificacion === 'PARCIAL'
  );
  const recuperatoriosPorParcial = new Map(
    input.calificaciones
      .filter(calificacion => calificacion.tipoCalificacion === 'RECUPERATORIO')
      .filter(
        calificacion =>
          calificacion.parcialOriginalId !== null &&
          calificacion.parcialOriginalId !== undefined
      )
      .map(calificacion => [calificacion.parcialOriginalId!, calificacion])
  );

  const parcialesEfectivos = parciales.map(parcial => {
    const recuperatorio = recuperatoriosPorParcial.get(parcial.id);
    return {
      numero: parcial.numero,
      notaOriginal: parcial.nota,
      notaEfectiva: recuperatorio?.nota ?? parcial.nota,
      recuperado: recuperatorio !== undefined
    };
  });

  const promedio =
    parcialesEfectivos.length > 0
      ? Number(
          (
            parcialesEfectivos.reduce((acc, parcial) => acc + parcial.notaEfectiva, 0) /
            parcialesEfectivos.length
          ).toFixed(2)
        )
      : null;

  const tpsCargados = input.calificaciones.filter(
    calificacion => calificacion.tipoCalificacion === 'TRABAJO_PRACTICO'
  );
  const tpsAprobados = tpsCargados.filter(
    calificacion => calificacion.nota >= input.notaMinima
  ).length;
  const porcentajeTps =
    tpsCargados.length > 0
      ? Number(((tpsAprobados / tpsCargados.length) * 100).toFixed(2))
      : null;

  return {
    parcialesEfectivos,
    promedio,
    cumpleNotaMinima:
      promedio === null
        ? null
        : promedio >= input.notaMinima &&
          parcialesEfectivos.every(parcial => parcial.notaEfectiva >= input.notaMinima),
    examenFinalNota:
      input.calificaciones.find(calificacion => calificacion.tipoCalificacion === 'EXAMEN_FINAL')
        ?.nota ?? null,
    tps: {
      cargados: tpsCargados.length,
      aprobados: tpsAprobados,
      porcentaje: porcentajeTps,
      requerido: input.tpRequeridos,
      cumple: porcentajeTps === null ? null : porcentajeTps >= input.tpRequeridos
    }
  };
}

export type TipoCalificacionCarga =
  | 'PARCIAL'
  | 'RECUPERATORIO'
  | 'COLOQUIO'
  | 'EXAMEN_FINAL'
  | 'TRABAJO_PRACTICO'
  | 'PROMOCION';

export interface FilaCargaCalificaciones {
  alumnoId: number;
  tipoCalificacion: TipoCalificacionCarga;
  numero?: number;
  nota: number;
  fechaEvaluacion?: string | Date;
  parcialOriginalId?: number;
  observacion?: string | null;
}

export interface ParcialReferencia {
  id: number;
  cursadaId: number;
  alumnoId: number;
  tipoCalificacion: string;
  numero: number;
}

export interface PrepararCargaCalificacionesSnapshot {
  alumnosPorUsuarioId: ReadonlyMap<number, number>;
  inscripciones: ReadonlySet<number>;
  parcialesPorId: ReadonlyMap<number, ParcialReferencia>;
}

export interface FilaCalificacionPreparada {
  idAlumno: number;
  tipoCalificacion: TipoCalificacionCarga;
  numero: number;
  nota: number;
  fechaEvaluacion: Date | null;
  parcialOriginalId: number | null;
  observacion: string | null;
}

export type PreparacionCalificacionesError =
  | { tipo: 'ALUMNO_NO_ASOCIADO'; idUsuario: number }
  | { tipo: 'ALUMNO_NO_INSCRIPTO'; idUsuario: number; idAlumno: number }
  | { tipo: 'FECHA_PARCIAL_REQUERIDA' }
  | { tipo: 'PARCIAL_ORIGINAL_REQUERIDO' }
  | { tipo: 'PARCIAL_NO_CORRESPONDE'; parcialOriginalId: number }
  | {
      tipo: 'DUPLICADO';
      idAlumno: number;
      tipoCalificacion: TipoCalificacionCarga;
      numero: number;
    };

export type ResultadoPreparacion =
  | { ok: true; filas: FilaCalificacionPreparada[] }
  | { ok: false; error: PreparacionCalificacionesError };

export function prepararCargaCalificaciones(
  comando: { cursadaId: number; calificaciones: FilaCargaCalificaciones[] },
  snapshot: PrepararCargaCalificacionesSnapshot
): ResultadoPreparacion {
  const filas: FilaCalificacionPreparada[] = [];

  for (const fila of comando.calificaciones) {
    const idAlumno = snapshot.alumnosPorUsuarioId.get(fila.alumnoId);
    if (idAlumno === undefined) {
      return {
        ok: false,
        error: { tipo: 'ALUMNO_NO_ASOCIADO', idUsuario: fila.alumnoId }
      };
    }

    if (!snapshot.inscripciones.has(idAlumno)) {
      return {
        ok: false,
        error: { tipo: 'ALUMNO_NO_INSCRIPTO', idUsuario: fila.alumnoId, idAlumno }
      };
    }

    if (fila.tipoCalificacion === 'PARCIAL' && !fila.fechaEvaluacion) {
      return {
        ok: false,
        error: { tipo: 'FECHA_PARCIAL_REQUERIDA' }
      };
    }

    let numero = fila.numero ?? 1;
    let parcialOriginalId: number | null = null;
    if (fila.tipoCalificacion === 'RECUPERATORIO') {
      if (!fila.parcialOriginalId) {
        return {
          ok: false,
          error: { tipo: 'PARCIAL_ORIGINAL_REQUERIDO' }
        };
      }

      const parcial = snapshot.parcialesPorId.get(fila.parcialOriginalId);
      if (
        !parcial ||
        parcial.tipoCalificacion !== 'PARCIAL' ||
        parcial.cursadaId !== comando.cursadaId ||
        parcial.alumnoId !== idAlumno
      ) {
        return {
          ok: false,
          error: { tipo: 'PARCIAL_NO_CORRESPONDE', parcialOriginalId: fila.parcialOriginalId }
        };
      }

      numero = parcial.numero;
      parcialOriginalId = parcial.id;
    }

    filas.push({
      idAlumno,
      tipoCalificacion: fila.tipoCalificacion,
      numero,
      nota: fila.nota,
      fechaEvaluacion: fila.fechaEvaluacion ? new Date(fila.fechaEvaluacion) : null,
      parcialOriginalId,
      observacion: fila.observacion ?? null
    });
  }

  const vistos = new Set<string>();
  for (const fila of filas) {
    const clave = `${fila.idAlumno}-${fila.tipoCalificacion}-${fila.numero}`;
    if (vistos.has(clave)) {
      return {
        ok: false,
        error: {
          tipo: 'DUPLICADO',
          idAlumno: fila.idAlumno,
          tipoCalificacion: fila.tipoCalificacion,
          numero: fila.numero
        }
      };
    }
    vistos.add(clave);
  }

  return { ok: true, filas };
}
