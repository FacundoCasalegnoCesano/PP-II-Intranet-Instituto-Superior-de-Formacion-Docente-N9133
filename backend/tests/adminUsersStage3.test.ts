import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import userService from '../src/services/userService.js';
import userRepository from '../src/repositories/userRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import { decryptBackupCodes } from '../src/utils/backupCodes.js';
import { changeRoleSchema, updateUserSchema } from '../src/validations/userValidation.js';
import UserController from '../src/controllers/userController.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

const admin = {
  id: 1,
  email: 'admin@example.com',
  dni: '30000000',
  rol: ROLES.ADMINISTRATIVO,
  nombre: 'Administrativo'
};

function usuario(overrides: Record<string, unknown> = {}) {
  return {
    idUsuario: 20,
    apellidoNombre: 'Cuenta de prueba',
    dni: 30111222,
    email: 'cuenta@example.com',
    fechaNacimiento: new Date('1990-01-01'),
    telefono: '3400000000',
    passwordHash: 'hash',
    cuil: '20301112223',
    activo: true,
    rol: ROLES.PROFESOR,
    contactoEmergencia: null,
    foto: null,
    backupCodes: null,
    ultimoAcceso: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sesiones: [],
    alumno: null,
    ...overrides
  };
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('el detalle administrativo incluye roles y la ficha Alumno preservada', async () => {
  const alumno = {
    idAlumno: 7,
    idCuenta: 20,
    domicilio: 'Belgrano 123',
    anioEgreso: 2020,
    institucionProcedencia: 'Escuela 1',
    adeudaMateria: false
  };
  replaceMethod(userRepository, 'findById', async () => usuario({
    rol: `${ROLES.ALUMNO},${ROLES.PROFESOR}`,
    alumno
  }));

  const result = await userService.getUserById(20);

  assert.deepEqual(result.roles, [ROLES.ALUMNO, ROLES.PROFESOR]);
  assert.deepEqual(result.alumno, alumno);
  assert.equal('passwordHash' in result, false);
});

test('agregar ALUMNO exige ficha cuando no existe y sincroniza perfil y sesiones', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario());
  let savedRoles = '';
  let savedAlumno: unknown;
  let revoked = false;
  replaceMethod(userRepository, 'update', async (_id: number, data: any) => {
    savedRoles = data.rol;
    return usuario({ rol: data.rol });
  });
  replaceMethod(alumnoRepository, 'upsertByUsuarioId', async (_id: number, data: unknown) => {
    savedAlumno = data;
    return { idAlumno: 7, idCuenta: 20, ...(data as object) };
  });
  replaceMethod(prisma.sesion, 'updateMany', async () => {
    revoked = true;
    return { count: 2 };
  });

  await assert.rejects(
    userService.changeUserRole(20, ROLES.ALUMNO, admin),
    (error: any) => error.statusCode === 400 && /ficha/i.test(error.message)
  );

  const alumno = {
    domicilio: 'Belgrano 123',
    anioEgreso: 2020,
    institucionProcedencia: 'Escuela 1'
  };
  const result = await userService.changeUserRole(20, ROLES.ALUMNO, admin, alumno);

  assert.equal(savedRoles, `${ROLES.PROFESOR},${ROLES.ALUMNO}`);
  assert.deepEqual(savedAlumno, alumno);
  assert.equal(revoked, true);
  assert.deepEqual(result.roles, [ROLES.PROFESOR, ROLES.ALUMNO]);
});

test('agregar ADMINISTRATIVO genera códigos cifrados y revoca sesiones sin exponerlos', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario());
  let backupCodes: string | null | undefined;
  replaceMethod(userRepository, 'update', async (_id: number, data: any) => {
    backupCodes = data.backupCodes;
    return usuario({ rol: data.rol, backupCodes: data.backupCodes });
  });
  let revoked = false;
  replaceMethod(prisma.sesion, 'updateMany', async () => {
    revoked = true;
    return { count: 1 };
  });

  const result = await userService.changeUserRole(20, ROLES.ADMINISTRATIVO, admin);

  assert.equal(typeof backupCodes, 'string');
  assert.equal(decryptBackupCodes(backupCodes as string).length, 8);
  assert.equal(revoked, true);
  assert.equal('backupCodes' in result, false);
});

test('quitar ALUMNO conserva la ficha y revoca todas las sesiones', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario({
    rol: `${ROLES.ALUMNO},${ROLES.PROFESOR}`,
    alumno: { idAlumno: 7, idCuenta: 20, domicilio: 'Belgrano 123', anioEgreso: 2020 }
  }));
  replaceMethod(userRepository, 'update', async (_id: number, data: any) => usuario({ rol: data.rol }));
  let deletedProfile = false;
  replaceMethod(alumnoRepository, 'deleteByUsuarioId', async () => {
    deletedProfile = true;
    return { count: 1 };
  });
  let revoked = false;
  replaceMethod(prisma.sesion, 'updateMany', async () => {
    revoked = true;
    return { count: 1 };
  });

  const result = await userService.removeUserRole(20, ROLES.ALUMNO, admin);

  assert.equal(deletedProfile, false);
  assert.equal(revoked, true);
  assert.deepEqual(result.roles, [ROLES.PROFESOR]);
});

test('quitar ADMINISTRATIVO elimina códigos de respaldo y revoca sesiones', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario({
    rol: `${ROLES.ADMINISTRATIVO},${ROLES.PROFESOR}`,
    backupCodes: 'encrypted'
  }));
  let updateData: any;
  replaceMethod(userRepository, 'update', async (_id: number, data: any) => {
    updateData = data;
    return usuario({ rol: data.rol });
  });
  let revoked = false;
  replaceMethod(prisma.sesion, 'updateMany', async () => {
    revoked = true;
    return { count: 1 };
  });

  await userService.removeUserRole(20, ROLES.ADMINISTRATIVO, admin);

  assert.equal(updateData.backupCodes, null);
  assert.equal(revoked, true);
});

test('desactivar una cuenta revoca inmediatamente sus sesiones activas', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario());
  replaceMethod(userRepository, 'toggleActive', async (_id: number, active: boolean) => usuario({ activo: active }));
  let revoked = false;
  replaceMethod(prisma.sesion, 'updateMany', async ({ where, data }: any) => {
    revoked = where.usuarioId === 20 && data.revocadaEn instanceof Date && data.cerradaEn instanceof Date;
    return { count: 2 };
  });

  const result = await userService.toggleUserActive(20, false, admin);

  assert.equal(result.activo, false);
  assert.equal(revoked, true);
});

test('el endpoint heredado de baja de usuario realiza baja lógica y nunca borrado físico', async () => {
  replaceMethod(userRepository, 'findById', async () => usuario());
  let deactivated = false;
  replaceMethod(userRepository, 'toggleActive', async (_id: number, active: boolean) => {
    deactivated = active === false;
    return usuario({ activo: active });
  });
  let physicallyDeleted = false;
  replaceMethod(userRepository, 'delete', async () => {
    physicallyDeleted = true;
    return usuario();
  });
  replaceMethod(prisma.sesion, 'deleteMany', async () => ({ count: 0 }));
  replaceMethod(prisma.sesion, 'updateMany', async () => ({ count: 2 }));

  const result = await userService.deleteUser(20, admin);

  assert.equal(deactivated, true);
  assert.equal(physicallyDeleted, false);
  assert.match(result.message, /desactivado/i);
});

test('los contratos de usuario aceptan ficha Alumno solo en los payloads permitidos', () => {
  const rolePayload = {
    rol: ROLES.ALUMNO,
    alumno: { domicilio: 'Belgrano 123', anioEgreso: 2020, institucionProcedencia: 'Escuela 1' }
  };
  assert.equal(changeRoleSchema.validate(rolePayload).error, undefined);
  assert.ok(changeRoleSchema.validate({ rol: ROLES.PROFESOR, alumno: rolePayload.alumno }).error);
  assert.equal(updateUserSchema.validate({ alumno: { domicilio: 'Nuevo domicilio' } }).error, undefined);
  assert.ok(updateUserSchema.validate({ rol: ROLES.PROFESOR }).error);
  assert.ok(updateUserSchema.validate({ activo: false }).error);
  assert.ok(updateUserSchema.validate({ password: 'Temporal123!' }).error);
});

test('el controlador entrega la ficha Alumno al servicio al agregar el rol', async () => {
  const alumno = { domicilio: 'Belgrano 123', anioEgreso: 2020, institucionProcedencia: 'Escuela 1' };
  let receivedAlumno: unknown;
  replaceMethod(userService, 'changeUserRole', async (_id: number, _rol: string, _current: unknown, profile: unknown) => {
    receivedAlumno = profile;
    return { idUsuario: 20, roles: [ROLES.PROFESOR, ROLES.ALUMNO], alumno } as any;
  });
  const controller = new UserController();
  const req = { params: { id: '20' }, body: { rol: ROLES.ALUMNO, alumno }, user: admin } as any;
  const res = {
    json(payload: unknown) {
      return payload;
    }
  } as any;

  await controller.changeUserRole(req, res, (error?: unknown) => {
    if (error) throw error;
  });

  assert.deepEqual(receivedAlumno, alumno);
});
