import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';

const restorations: Array<() => void> = [];
function replace(target: any, key: string, value: any) {
  const original = target[key]; target[key] = value;
  restorations.push(() => { if (original === undefined) delete target[key]; else target[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

const materia = { id: 7, nombre: 'Historia', carreraId: 3, notaMinima: 6, modalidad: 'PRESENCIAL', regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION', esPromocionable: false, aniosRegularidad: 3, activo: true, curso: null, espacioCurricular: null };
const fecha2018 = new Date('2018-11-14T00:00:00.000Z');

function setup({ final = false, homologacion = false }: { final?: boolean; homologacion?: boolean } = {}) {
  replace(carreraRepository, 'getPlanEstudio', async () => ({ id: 3, nombre: 'Profesorado', duracionAnios: 4, activo: true, materias: [materia], espaciosCurriculares: [] }));
  replace(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 14, idCuenta: 20 }));
  let registrationCalls = 0;
  replace(prisma.inscripcionMateria, 'findMany', async () => {
    registrationCalls++;
    if (registrationCalls === 1) return [{
      id: 80, alumnoId: 14, materiaId: 7, estado: 'ACTIVA', cicloLectivo: new Date().getFullYear(), fechaBaja: null,
      materia, cursada: { id: 90, materiaId: 7, anioLectivo: new Date().getFullYear(), periodo: 'ANUAL', activo: true, materia, calificaciones: [], asistencias: [] }
    }];
    return [];
  });
  replace(prisma.inscripcionExamen, 'findMany', async () => final ? [{
    id: 5, aprobado: true, notaFinal: 7, updatedAt: new Date('2020-01-01'), mesa: { materiaId: 7, fechaCivil: new Date('2019-12-01'), materia }
  }] : []);
  replace(prisma.homologacion, 'findMany', async () => homologacion ? [{
    id: 6, materiaId: 7, estado: 'APROBADA', calificacion: 9, fechaHomologacion: new Date('2020-01-01'), materia
  }] : []);
  replace(prisma as any, 'promocionHistorica', {
    findMany: async () => [{ id: 12, version: 2, notaFinal: 8, fechaAcreditacion: fecha2018, inscripcionMateria: { id: 51, materiaId: 7, cicloLectivo: 2018, cursadaId: 55, materia } }]
  });
}

test('promoción histórica 2018 acredita trayectoria aunque haya una cursada actual pendiente', async () => {
  setup();
  const result = await estadoAcademicoService.getTrayectoriaIntegral(20, 3, { id: 20, rol: 'ALUMNO' });
  assert.equal(result.materias[0].estado, 'PROMOCIONADO');
  assert.deepEqual(result.materias[0].definitiva, {
    via: 'PROMOCION_DIRECTA', nota: 8, fecha: fecha2018, fuente: 'HISTORICA', version: 2
  });
  assert.equal(result.promedioGeneral, 8);
});

test('final aprobado prevalece sobre homologación y promoción histórica', async () => {
  setup({ final: true, homologacion: true });
  const result = await estadoAcademicoService.getTrayectoriaIntegral(20, 3, { id: 20, rol: 'ALUMNO' });
  assert.equal(result.materias[0].definitiva.via, 'EXAMEN_FINAL');
  assert.equal(result.materias[0].definitiva.nota, 7);
});

test('homologación prevalece sobre promoción histórica si no hay final aprobado', async () => {
  setup({ homologacion: true });
  const result = await estadoAcademicoService.getTrayectoriaIntegral(20, 3, { id: 20, rol: 'ALUMNO' });
  assert.equal(result.materias[0].definitiva.via, 'HOMOLOGACION');
  assert.equal(result.materias[0].definitiva.nota, 9);
});
