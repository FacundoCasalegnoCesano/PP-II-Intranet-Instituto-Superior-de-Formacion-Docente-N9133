import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import inscripcionMateriaRepository from '../src/repositories/inscripcionMateriaRepository.js';

const restorations: Array<() => void> = [];
function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('ordena inscripciones activas de alumno por fecha e ID para estabilizar páginas', async () => {
  let query: any;
  replaceMethod(prisma.inscripcionMateria, 'findMany', async (args: any) => { query = args; return []; });
  replaceMethod(prisma.inscripcionMateria, 'count', async () => 0);
  await inscripcionMateriaRepository.findByAlumnoId(17, { page: 2, limit: 20 });

  assert.deepEqual(query.where, { alumnoId: 17, estado: { in: ['ACTIVA', 'RECURSANDO'] } });
  assert.deepEqual(query.orderBy, [{ fechaInscripcion: 'desc' }, { id: 'desc' }]);
  assert.equal(query.skip, 20);
  assert.equal(query.take, 20);
});
