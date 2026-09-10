import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { generateBackupCodes, encryptBackupCodes } from '../utils/backupCodes.js';
import { hashPassword } from '../utils/bcrypt.js';
import { registerSchema } from '../validations/authValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

type AdminEnvironmentVariable =
  | 'ADMIN_NAME'
  | 'ADMIN_DNI'
  | 'ADMIN_EMAIL'
  | 'ADMIN_BIRTH_DATE'
  | 'ADMIN_PHONE'
  | 'ADMIN_PASSWORD'
  | 'ADMIN_CUIL';

interface AdminBootstrapData {
  apellidoNombre: string;
  dni: number;
  email: string;
  fechaNacimiento: Date;
  telefono: string;
  password: string;
  cuil: string;
  contactoEmergencia: string | null;
}

function requiredEnvironmentVariable(environment: NodeJS.ProcessEnv, name: AdminEnvironmentVariable): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}`);
  }
  return value;
}

export function readAdminBootstrapData(environment: NodeJS.ProcessEnv = process.env): AdminBootstrapData {
  const candidate = {
    apellidoNombre: requiredEnvironmentVariable(environment, 'ADMIN_NAME'),
    dni: requiredEnvironmentVariable(environment, 'ADMIN_DNI'),
    email: requiredEnvironmentVariable(environment, 'ADMIN_EMAIL').toLowerCase(),
    fechaNacimiento: requiredEnvironmentVariable(environment, 'ADMIN_BIRTH_DATE'),
    telefono: requiredEnvironmentVariable(environment, 'ADMIN_PHONE'),
    password: requiredEnvironmentVariable(environment, 'ADMIN_PASSWORD'),
    cuil: requiredEnvironmentVariable(environment, 'ADMIN_CUIL'),
    rol: ROLES.ADMINISTRATIVO,
    contactoEmergencia: environment.ADMIN_EMERGENCY_CONTACT?.trim() || null
  };
  const { error, value } = registerSchema.validate(candidate, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw new Error(`Las variables del administrador no son válidas: ${error.details.map(detail => detail.message).join('; ')}`);
  }

  return {
    apellidoNombre: value.apellidoNombre,
    dni: Number(value.dni),
    email: value.email,
    fechaNacimiento: value.fechaNacimiento,
    telefono: value.telefono,
    password: value.password,
    cuil: value.cuil,
    contactoEmergencia: value.contactoEmergencia
  };
}

export async function createAdmin(): Promise<void> {
  try {
    const existingAdmin = await prisma.usuario.findFirst({
      where: { rol: { contains: ROLES.ADMINISTRATIVO } }
    });

    if (existingAdmin) {
      console.log('Ya existe un administrador en el sistema');
      console.log(`Email: ${existingAdmin.email}`);
      return;
    }

    const input = readAdminBootstrapData();
    const passwordHash = await hashPassword(input.password);
    const backupCodesEncrypted = encryptBackupCodes(generateBackupCodes(8));

    const admin = await prisma.usuario.create({
      data: {
        apellidoNombre: input.apellidoNombre,
        dni: input.dni,
        email: input.email,
        fechaNacimiento: input.fechaNacimiento,
        telefono: input.telefono,
        passwordHash,
        cuil: input.cuil,
        rol: ROLES.ADMINISTRATIVO,
        activo: true,
        contactoEmergencia: input.contactoEmergencia,
        backupCodes: backupCodesEncrypted
      }
    });

    console.log('Administrador creado exitosamente');
    console.log(`Email: ${admin.email}`);
    console.log('Ingresá al perfil administrativo para consultar y guardar los códigos de respaldo.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAdmin().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`No se pudo crear el administrador: ${message}`);
    process.exitCode = 1;
  });
}
