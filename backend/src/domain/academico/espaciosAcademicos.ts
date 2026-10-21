export type DefinitivaAcademica = {
  nota: number | null;
  via: string;
};

export type MateriaAcademica = {
  materia: { id: number; nombre: string };
  estado: string;
  definitiva?: DefinitivaAcademica | null;
};

export type EspacioAcademico = {
  id: number;
  nombre: string;
  materias: Array<{ id: number; nombre: string }>;
};

export type EspacioEvaluado = {
  id: number;
  nombre: string;
  estado: 'APROBADA' | 'PENDIENTE';
  nota: number | null;
  definitiva: DefinitivaAcademica | null;
  componentes: Array<{
    materiaId: number;
    nombre: string;
    estado: string;
    definitiva: DefinitivaAcademica | null;
  }>;
};

const VIAS_DEFINITIVAS = new Set(['EXAMEN_FINAL', 'HOMOLOGACION', 'PROMOCION_DIRECTA']);

function definitivaValida(definitiva: DefinitivaAcademica | null | undefined): definitiva is DefinitivaAcademica & { nota: number } {
  return typeof definitiva?.nota === 'number' && Number.isFinite(definitiva.nota) && VIAS_DEFINITIVAS.has(definitiva.via);
}

export function evaluarEspacios(
  espacios: EspacioAcademico[],
  materias: MateriaAcademica[]
): EspacioEvaluado[] {
  const porMateria = new Map(materias.map(materia => [materia.materia.id, materia]));
  return espacios.map(espacio => {
    const componentes = espacio.materias.map(componente => {
      const materia = porMateria.get(componente.id);
      return {
        materiaId: componente.id,
        nombre: componente.nombre,
        estado: materia?.estado ?? 'PENDIENTE',
        definitiva: materia?.definitiva ?? null
      };
    });
    const aprobada = componentes.length >= 2 && componentes.every(componente => definitivaValida(componente.definitiva));
    const nota = aprobada
      ? Math.floor(componentes.reduce((suma, componente) => suma + componente.definitiva!.nota!, 0) / componentes.length + 0.5)
      : null;
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      estado: aprobada ? 'APROBADA' : 'PENDIENTE',
      nota,
      definitiva: nota === null ? null : { nota, via: 'ESPACIO_CURRICULAR' },
      componentes
    };
  });
}

export function resumirUnidadesAcademicas(
  materias: MateriaAcademica[],
  espacios: EspacioEvaluado[]
): { promedio: number | null; aprobadas: number; total: number } {
  const componentesDeEspacio = new Set(espacios.flatMap(espacio => espacio.componentes.map(componente => componente.materiaId)));
  const materiasSueltas = materias.filter(materia => !componentesDeEspacio.has(materia.materia.id));
  const notas = materiasSueltas
    .filter(materia => definitivaValida(materia.definitiva))
    .map(materia => materia.definitiva!.nota!);
  const espaciosAprobados = espacios.filter(espacio => espacio.nota !== null);
  notas.push(...espaciosAprobados.map(espacio => espacio.nota!));
  return {
    promedio: notas.length > 0 ? Number((notas.reduce((suma, nota) => suma + nota, 0) / notas.length).toFixed(2)) : null,
    aprobadas: notas.length,
    total: materiasSueltas.length + espacios.length
  };
}
