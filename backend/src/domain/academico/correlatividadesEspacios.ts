export type RequisitoAcademico =
  | { tipo: 'MATERIA'; requisitoId: number; nombre: string; materiaId: number }
  | { tipo: 'ESPACIO'; requisitoId: number; nombre: string; espacioId: number; componentesIds: number[] };

export interface RequisitoAcademicoPendiente {
  tipo: 'MATERIA' | 'ESPACIO';
  requisitoId: number;
  nombre: string;
}

export function evaluarRequisitosAcademicos(input: {
  modo: 'CURSAR' | 'RENDIR';
  reglas: RequisitoAcademico[];
  materiasCumplidas: ReadonlySet<number>;
}): { cumple: boolean; pendientes: RequisitoAcademicoPendiente[]; primerError: RequisitoAcademicoPendiente | null } {
  const pendientes = input.reglas.filter(regla => {
    if (regla.tipo === 'MATERIA') return !input.materiasCumplidas.has(regla.materiaId);
    return regla.componentesIds.length < 2 || regla.componentesIds.some(id => !input.materiasCumplidas.has(id));
  }).map(({ tipo, requisitoId, nombre }) => ({ tipo, requisitoId, nombre }));
  return {
    cumple: pendientes.length === 0,
    pendientes,
    primerError: pendientes[0] ?? null
  };
}
