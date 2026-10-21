import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import carreraRepository from '../src/repositories/carreraRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import materiaService from '../src/services/materiaService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';

const restorations: Array<() => void> = [];

function replace(target: object, key: PropertyKey, value: unknown) {
  const record = target as Record<PropertyKey, unknown>;
  const original = record[key];
  record[key] = value;
  restorations.push(() => { record[key] = original; });
}

function transaction(tx: object) {
  replace(materiaRepository, 'withTransaction', async (operation: (db: unknown) => Promise<unknown>) => operation(tx));
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => []);
}

function setCareer() {
  replace(carreraRepository, 'findById', async () => ({ id: 1, nombre: 'Profesorado', duracionAnios: 4 }));
}

function setMateriaLookup(materia: Record<string, unknown>) {
  replace(materiaRepository, 'findById', async () => ({ id: 30, carreraId: 1, nombre: 'Práctica', activo: true, ...materia }));
}

afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('crear materia permite asignarla a un espacio en configuración sin correlativas propias', async () => {
  const txCalls: string[] = [];
  let persisted: any;
  transaction({
    $queryRaw: async (strings: TemplateStringsArray) => { txCalls.push(strings.join(' ')); return []; },
    espacioCurricular: { findUnique: async () => ({ id: 9, carreraId: 1, composicionBloqueadaAt: null }) },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 }
  });
  setCareer();
  replace(materiaRepository, 'findByCareerAndName', async () => null);
  replace(materiaRepository, 'resolveCursoId', async () => 21);
  replace(materiaRepository, 'create', async (input: any) => { persisted = input; return { id: 30, carreraId: 1 }; });
  replace(materiaRepository, 'getCorrelativityEdges', async () => []);
  replace(materiaRepository, 'getIncidentCorrelativityEdges', async () => []);
  setMateriaLookup({ espacioCurricularId: 9, correlatividadesOrigen: [] });

  await materiaService.createMateria({
    nombre: 'Práctica', cargaHoraria: 96, tipoEspacio: 'MATERIA', carreraId: 1,
    cursoAnio: 1, espacioCurricularId: 9
  });

  assert.equal(persisted.espacioCurricularId, 9);
  assert.ok(txCalls.some(sql => sql.includes('espacios_curriculares')));
});

test('crear materia en espacio rechaza correlativas propias antes de persistir', async () => {
  let created = false;
  transaction({
    $queryRaw: async () => [],
    espacioCurricular: { findUnique: async () => ({ id: 9, carreraId: 1, composicionBloqueadaAt: null }) },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 }
  });
  setCareer();
  replace(materiaRepository, 'create', async () => { created = true; return { id: 30, carreraId: 1 }; });

  await assert.rejects(materiaService.createMateria({
    nombre: 'Práctica', cargaHoraria: 96, tipoEspacio: 'MATERIA', carreraId: 1,
    cursoAnio: 1, espacioCurricularId: 9, correlativasIds: [12]
  }), /configurá el requisito en Espacios curriculares/);
  assert.equal(created, false);
});

test('actualizar no asigna, desvincula ni desactiva componentes con oferta activa o historia', async () => {
  for (const scenario of [
    { label: 'oferta activa al asignar', currentSpace: null, targetSpace: 9, active: 1, enrollments: 0, data: { espacioCurricularId: 9 } },
    { label: 'matrícula histórica al desvincular', currentSpace: 9, targetSpace: null, active: 0, enrollments: 1, data: { espacioCurricularId: null } },
    { label: 'matrícula histórica al desactivar', currentSpace: 9, targetSpace: 9, active: 0, enrollments: 1, data: { activo: false } },
    { label: 'historia al cambiar carrera', currentSpace: 9, targetSpace: null, active: 0, enrollments: 1, data: { carreraId: 2, espacioCurricularId: null } }
  ]) {
    let updated = false;
    const current = {
      id: 30, carreraId: 1, nombre: 'Práctica', activo: true,
      espacioCurricularId: scenario.currentSpace, curso: { anio: 1 }, correlatividadesOrigen: []
    };
    transaction({
      $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
      carrera: { findUnique: async ({ where }: any) => ({ id: where.id, nombre: 'Profesorado', duracionAnios: 4 }) },
      espacioCurricular: {
        findUnique: async ({ where }: any) => ({ id: where.id, carreraId: 1, composicionBloqueadaAt: null })
      },
      cursadaEspacio: { count: async () => scenario.active },
      inscripcionEspacio: { count: async () => scenario.enrollments }
    });
    setMateriaLookup(current);
    setCareer();
    replace(materiaRepository, 'update', async () => { updated = true; });

    await assert.rejects(materiaService.updateMateria(30, scenario.data), /ofertas activas o matrículas registradas/, scenario.label);
    assert.equal(updated, false, scenario.label);
  }
});

test('vincular materia existente con correlativas propias activas remite al editor de espacios', async () => {
  let updated = false;
  transaction({
    $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
    espacioCurricular: { findUnique: async () => ({ id: 9, carreraId: 1, composicionBloqueadaAt: null }) },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 }
  });
  setCareer();
  setMateriaLookup({ espacioCurricularId: null, correlatividadesOrigen: [{ materiaRequeridaId: 12, suspendidaPorEspacio: false }] });
  replace(materiaRepository, 'update', async () => { updated = true; });

  await assert.rejects(materiaService.updateMateria(30, { espacioCurricularId: 9 }), /correlatividades propias activas/);
  assert.equal(updated, false);
});

test('vincular materia rechaza ciclos entre el requisito del espacio y la materia incorporada', async () => {
  let updated = false;
  transaction({
    $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
    espacioCurricular: { findUnique: async () => ({ id: 9, carreraId: 1, composicionBloqueadaAt: null }) },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 }
  });
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => [
    { from: 'S:9', to: 'M:30', kind: 'SPACE', aplicaCursado: true, aplicaRendir: true }
  ]);
  setCareer();
  setMateriaLookup({ espacioCurricularId: null, correlatividadesOrigen: [] });
  replace(materiaRepository, 'update', async () => { updated = true; });

  await assert.rejects(materiaService.updateMateria(30, { espacioCurricularId: 9 }), /generaría un ciclo/);
  assert.equal(updated, false);
});

test('vincular materia fija el latch si el nuevo conjunto ya está aprobado', async () => {
  const latchCalls: any[] = [];
  const currentSpace = {
    id: 9, carreraId: 1, composicionBloqueadaAt: null,
    materias: [{ id: 29 }, { id: 30 }]
  };
  transaction({
    $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
    carrera: { findUnique: async ({ where }: any) => ({ id: where.id, nombre: 'Profesorado', duracionAnios: 4 }) },
    espacioCurricular: {
      findUnique: async () => currentSpace,
      updateMany: async (args: any) => { latchCalls.push(args); return { count: 1 }; }
    },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 },
    inscripcionExamen: { findMany: async () => [{ alumnoId: 41 }] },
    homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] }
  });
  setCareer();
  setMateriaLookup({ espacioCurricularId: null, correlatividadesOrigen: [] });
  replace(materiaRepository, 'update', async () => ({ id: 30 }));
  replace(materiaRepository, 'getIncidentCorrelativityEdges', async () => []);
  replace(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([29, 30]));

  await materiaService.updateMateria(30, { espacioCurricularId: 9 });

  assert.equal(latchCalls.length, 1);
  assert.deepEqual(latchCalls[0].where, { id: 9, composicionBloqueadaAt: null });
  assert.ok(latchCalls[0].data.composicionBloqueadaAt instanceof Date);
});

test('correlativas agrupadas o suspendidas no pueden reemplazarse desde la ruta de materia', async () => {
  for (const materia of [
    { espacioCurricularId: 9, correlatividadesOrigen: [{ materiaRequeridaId: 12, suspendidaPorEspacio: false }] },
    { espacioCurricularId: null, correlatividadesOrigen: [{ materiaRequeridaId: 12, suspendidaPorEspacio: true }] }
  ]) {
    let updated = false;
    transaction({
      $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
      carrera: { findUnique: async () => ({ id: 1, nombre: 'Profesorado', duracionAnios: 4 }) }
    });
    setCareer();
    setMateriaLookup(materia);
    replace(materiaRepository, 'update', async () => { updated = true; });
    await assert.rejects(materiaService.updateMateria(30, { correlativasIds: [] }), /se revisan desde Espacios curriculares/);
    assert.equal(updated, false);
  }
});

test('la baja de una materia común sigue disponible sin afectar espacios', async () => {
  let active = true;
  transaction({
    $queryRaw: async (strings: TemplateStringsArray) => strings.join(' ').includes('FROM materias') ? [{ carreraId: 1 }] : [],
    materia: { update: async ({ data }: any) => { active = data.activo; return { id: 30, activo: data.activo }; } }
  });
  setMateriaLookup({ espacioCurricularId: null });

  await materiaService.deleteMateria(30);
  assert.equal(active, false);
});
