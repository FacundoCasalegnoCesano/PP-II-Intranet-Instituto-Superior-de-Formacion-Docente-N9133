export interface HomologacionDto {
  id: number;
  alumno: { idUsuario: number; apellidoNombre: string; dni: string; email: string };
  materia: {
    id: number;
    nombre: string;
    notaMinima: number;
    carrera: { id: number; nombre: string };
  };
  tipo: 'TOTAL' | 'PARCIAL';
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  calificacion: number | null;
  notaComplementaria: number | null;
  observacion: string | null;
  fecha: string;
  createdAt: string;
  updatedAt: string;
}

interface HomologacionRow {
  id: number;
  tipoHomologacion: HomologacionDto['tipo'];
  estado: HomologacionDto['estado'];
  calificacion: number | null;
  notaExamenHomologacion: number | null;
  observacion: string | null;
  fechaHomologacion: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  alumno: {
    usuario: {
      idUsuario: number;
      apellidoNombre: string;
      dni: number | string;
      email: string;
    };
  };
  materia: {
    id: number;
    nombre: string;
    notaMinima: number | null;
    carrera: { id: number; nombre: string };
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toHomologacionDto(row: HomologacionRow): HomologacionDto {
  return {
    id: row.id,
    alumno: {
      idUsuario: row.alumno.usuario.idUsuario,
      apellidoNombre: row.alumno.usuario.apellidoNombre,
      dni: String(row.alumno.usuario.dni),
      email: row.alumno.usuario.email
    },
    materia: {
      id: row.materia.id,
      nombre: row.materia.nombre,
      notaMinima: row.materia.notaMinima ?? 6,
      carrera: {
        id: row.materia.carrera.id,
        nombre: row.materia.carrera.nombre
      }
    },
    tipo: row.tipoHomologacion,
    estado: row.estado,
    calificacion: row.calificacion,
    notaComplementaria: row.notaExamenHomologacion,
    observacion: row.observacion,
    fecha: toIso(row.fechaHomologacion),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}
