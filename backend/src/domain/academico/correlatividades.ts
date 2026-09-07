export type ModoCorrelatividad =
  | 'CURSAR'
  | 'RENDIR'
  | 'MOSTRAR_DISPONIBILIDAD';

export type TipoRequisitoCorrelatividad = 'OBLIGATORIA';

export interface MateriaReferencia {
  id: number;
  nombre: string;
}

export interface CorrelatividadSnapshot<TMateria extends MateriaReferencia = MateriaReferencia> {
  materiaRequeridaId: number;
  materiaRequerida: TMateria;
  aplicaCursado: boolean;
  aplicaRendir: boolean;
}

export interface CorrelatividadError {
  tipo: 'OBLIGATORIA_NO_CUMPLIDA';
  materiaRequeridaId: number;
  nombreMateria: string;
}

export interface CorrelatividadPendiente<
  TMateria extends MateriaReferencia = MateriaReferencia
> {
  tipo: 'MATERIA';
  materiaRequeridaId: number;
  materiaRequerida: TMateria;
}

export type ResultadoCorrelatividades<TMateria extends MateriaReferencia = MateriaReferencia> =
  | {
      cumple: true;
      primerError: null;
      pendientes: [];
    }
  | {
      cumple: false;
      primerError: CorrelatividadError;
      pendientes: CorrelatividadPendiente<TMateria>[];
    };

export interface EvaluarCorrelatividadesInput<
  TMateria extends MateriaReferencia = MateriaReferencia
> {
  modo: ModoCorrelatividad;
  correlatividades: CorrelatividadSnapshot<TMateria>[];
  materiasCumplidas: ReadonlySet<number>;
}

export function evaluarCorrelatividades<
  TMateria extends MateriaReferencia = MateriaReferencia
>(
  input: EvaluarCorrelatividadesInput<TMateria>
): ResultadoCorrelatividades<TMateria> {
  const correlatividades = input.modo === 'RENDIR'
    ? input.correlatividades.filter(correlatividad => correlatividad.aplicaRendir)
    : input.correlatividades;

  let primerError: CorrelatividadError | null = null;
  const pendientes: CorrelatividadPendiente<TMateria>[] = [];

  for (const correlatividad of correlatividades) {
    if (input.materiasCumplidas.has(correlatividad.materiaRequeridaId)) continue;

    primerError ??= {
      tipo: 'OBLIGATORIA_NO_CUMPLIDA',
      materiaRequeridaId: correlatividad.materiaRequeridaId,
      nombreMateria: correlatividad.materiaRequerida.nombre || 'la materia requerida'
    };

    if (input.modo !== 'RENDIR') {
      pendientes.push({
        tipo: 'MATERIA',
        materiaRequeridaId: correlatividad.materiaRequeridaId,
        materiaRequerida: correlatividad.materiaRequerida
      });
    }
  }

  if (primerError === null) {
    return {
      cumple: true,
      primerError: null,
      pendientes: []
    };
  }

  return {
    cumple: false,
    primerError,
    pendientes
  };
}
