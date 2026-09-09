import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import profesorMateriaRepository from '../src/repositories/profesorMateriaRepository.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('resume una cursada histórica para un profesor autorizado reutilizando el cálculo académico', async () => {
  const cursada = {
    id: 9,
    materiaId: 3,
    docenteId: 22,
    anioLectivo: 2025,
    periodo: 'ANUAL',
    activo: false
  };
  const materia = {
    id: 3,
    nombre: 'Didáctica',
    carreraId: 1,
    notaMinima: 6,
    notaPromocion: 8,
    asistenciaRequerida: 75,
    tpRequeridos: 75,
    esPromocionable: true
  };

  replaceMethod(cursadaRepository, 'findById', async () => ({ ...cursada, materia }));
  let inscriptosConsultados = 0;
  let calificacionesConsultadas = 0;
  let asistenciasConsultadas = 0;
  replaceMethod(calificacionRepository, 'getInscriptosActivosByCursada', async () => {
    inscriptosConsultados += 1;
    return [
      { alumnoId: 7, alumno: { idCuenta: 13, usuario: { idUsuario: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } } },
      { alumnoId: 8, alumno: { idCuenta: 14, usuario: { idUsuario: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222 } } }
    ];
  });
  replaceMethod(calificacionRepository, 'findAllByCursadaSimple', async () => {
    calificacionesConsultadas += 1;
    return [
    { id: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6, parcialOriginalId: null },
    { id: 2, alumnoId: 7, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 8, parcialOriginalId: 1 },
    { id: 3, alumnoId: 7, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8, parcialOriginalId: null },
    { id: 4, alumnoId: 8, tipoCalificacion: 'PARCIAL', numero: 1, nota: 3, parcialOriginalId: null },
    { id: 5, alumnoId: 8, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 3, parcialOriginalId: null }
    ];
  });
  replaceMethod(asistenciaRepository, 'findAllByCursadaSimple', async () => {
    asistenciasConsultadas += 1;
    return [
    { alumnoId: 7, fecha: new Date('2025-04-01T12:00:00.000Z'), presente: true, justificado: false },
    { alumnoId: 7, fecha: new Date('2025-04-08T12:00:00.000Z'), presente: true, justificado: false },
    { alumnoId: 7, fecha: new Date('2025-04-15T12:00:00.000Z'), presente: true, justificado: false },
    { alumnoId: 7, fecha: new Date('2025-04-22T12:00:00.000Z'), presente: true, justificado: false },
    { alumnoId: 8, fecha: new Date('2025-04-01T12:00:00.000Z'), presente: false, justificado: false },
    { alumnoId: 8, fecha: new Date('2025-04-08T12:00:00.000Z'), presente: false, justificado: false },
    { alumnoId: 8, fecha: new Date('2025-04-15T12:00:00.000Z'), presente: false, justificado: false },
    { alumnoId: 8, fecha: new Date('2025-04-22T12:00:00.000Z'), presente: true, justificado: false }
    ];
  });

  const resultado = await estadoAcademicoService.getResumenPorCursada(
    9,
    { id: 22, rol: ROLES.PROFESOR }
  );

  assert.equal(resultado.cursadaId, 9);
  assert.deepEqual(resultado.alumnos[0].alumno, {
    alumnoId: 13,
    apellidoNombre: 'Lucía Fernández',
    dni: 42666888
  });
  assert.equal('idAlumno' in resultado.alumnos[0].alumno, false);
  assert.deepEqual(resultado.alumnos[0].parcialesEfectivos, [
    { numero: 1, notaOriginal: 6, notaEfectiva: 8, recuperado: true }
  ]);
  assert.equal(resultado.alumnos[0].promedio, 8);
  assert.equal(resultado.alumnos[0].notaMinima, 6);
  assert.equal(resultado.alumnos[0].estado, 'HABILITADO_PROMOCION');
  assert.deepEqual(resultado.alumnos[0].requisitosPendientes, ['INSTANCIA_INTEGRADORA']);
  assert.deepEqual(resultado.alumnos[1].alumno, {
    alumnoId: 14,
    apellidoNombre: 'Marcos Acosta',
    dni: 30111222
  });
  assert.deepEqual(resultado.alumnos[1].parcialesEfectivos, [
    { numero: 1, notaOriginal: 3, notaEfectiva: 3, recuperado: false }
  ]);
  assert.equal(resultado.alumnos[1].promedio, 3);
  assert.equal(resultado.alumnos[1].estado, 'LIBRE');
  assert.equal(inscriptosConsultados, 1);
  assert.equal(calificacionesConsultadas, 1);
  assert.equal(asistenciasConsultadas, 1);
});

test('rechaza el resumen de una cursada no autorizada antes de consultar alumnos', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 9,
    materiaId: 3,
    docenteId: 99,
    anioLectivo: 2025,
    periodo: 'ANUAL',
    activo: false,
    materia: { id: 3, nombre: 'Didáctica', carreraId: 1 }
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => null);
  let consultoAlumnos = false;
  replaceMethod(calificacionRepository, 'getInscriptosActivosByCursada', async () => {
    consultoAlumnos = true;
    return [];
  });

  await assert.rejects(
    estadoAcademicoService.getResumenPorCursada(9, { id: 22, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );
  assert.equal(consultoAlumnos, false);
});
