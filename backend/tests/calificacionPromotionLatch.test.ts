import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import calificacionService from '../src/services/calificacionService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('serializa el lote promocionable, recalcula con el evaluador y fija el latch en la misma transacción', async () => {
  const events: string[] = [];
  const transaction = {} as any;
  const latched: number[] = [];
  const cursada = {
    id: 4,
    materiaId: 30,
    anioLectivo: 2026,
    periodo: 'ANUAL',
    activo: true,
    materia: {
      id: 30,
      espacioCurricularId: 55,
      nombre: 'Materia promocionable',
      carreraId: 3,
      notaMinima: 6,
      notaPromocion: 8,
      asistenciaRequerida: 75,
      tpRequeridos: 100,
      esPromocionable: true,
      modalidad: 'PRESENCIAL',
      regimen: 'REGULAR_PRESENCIAL_PROMOCION',
      tipoEspacio: 'MATERIA',
      aniosRegularidad: 3
    }
  };

  replaceMethod(cursadaRepository, 'findById', async () => cursada);
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => [{ idCuenta: 10, idAlumno: 7 }]);
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async () => [{ alumnoId: 7 }]);
  replaceMethod(calificacionRepository, 'withTransaction', async (operation: any) => operation({
    ...transaction,
    $queryRaw: async (strings: TemplateStringsArray) => { events.push(`lock:${strings.join('?')}`); return []; },
    cursada: { findUnique: async () => cursada },
    alumno: { findMany: async () => [{ idAlumno: 7, idCuenta: 10 }] },
    calificacion: {
      findMany: async () => [
        { id: 101, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8, parcialOriginalId: null },
        { id: 102, alumnoId: 7, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 10, parcialOriginalId: null },
        { id: 103, alumnoId: 7, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8, parcialOriginalId: null }
      ]
    },
    asistencia: { findMany: async () => [] },
    espacioCurricular: {
      findFirst: async () => ({ id: 55, composicionBloqueadaAt: null, materias: [{ id: 30 }, { id: 31 }] }),
      updateMany: async ({ where }: any) => { events.push('latch'); latched.push(where.id); return { count: 1 }; }
    }
  }));
  replaceMethod(calificacionRepository, 'upsertLote', async (_id: number, _rows: any[], db: any) => {
    assert.ok(db);
    events.push('save');
    return [{}];
  });
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([31]));

  const result = await calificacionService.cargarLote({
    cursadaId: 4,
    calificaciones: [{ alumnoId: 10, tipoCalificacion: 'EXAMEN_FINAL', nota: 8 } as any]
  }, { id: 1, rol: ROLES.ADMINISTRATIVO });

  assert.deepEqual(result, { registros: 1 });
  assert.match(events[0], /^lock:SELECT id FROM carreras WHERE id = \?/);
  assert.deepEqual(events.slice(1), ['save', 'latch']);
  assert.deepEqual(latched, [55]);
});

test('upsertLote usa el cliente transaccional recibido', async () => {
  const writes: any[] = [];
  const tx = { calificacion: { upsert: async (args: any) => { writes.push(args); return args.data; } } } as any;
  const rows = await calificacionRepository.upsertLote(4, [{
    idAlumno: 7,
    tipoCalificacion: 'EXAMEN_FINAL',
    numero: 1,
    nota: 8,
    fechaEvaluacion: null,
    parcialOriginalId: null,
    observacion: null
  }], tx);

  assert.equal(writes.length, 1);
  assert.deepEqual(rows, [writes[0].data]);
  assert.deepEqual(writes[0].where.cursadaId_alumnoId_tipoCalificacion_numero, {
    cursadaId: 4,
    alumnoId: 7,
    tipoCalificacion: 'EXAMEN_FINAL',
    numero: 1
  });
});
