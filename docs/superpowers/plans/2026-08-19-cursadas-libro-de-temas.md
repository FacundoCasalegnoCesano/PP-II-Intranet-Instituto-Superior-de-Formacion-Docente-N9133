# Endpoints de Cursadas y Libro de Temas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el CRUD de Cursadas (con inscriptos por comisión), el módulo de Libro de Temas según openapi, y la auto-vinculación de cursada al inscribir alumnos a materias.

**Architecture:** Capas del proyecto (validations Joi → routes → controllers → services → repositories con Prisma). El repositorio `cursadaRepository.ts` ya existe y se extiende; `LibroDeTema` se crea de cero. Al inscribir un alumno a una materia se vincula la cursada activa de la materia en el ciclo lectivo (`cursadaId`), de lo contrario queda NULL.

**Tech Stack:** Express 4 + TypeScript, Prisma (MySQL), Joi, JWT (middleware `authMiddleware`/`roleCheck`).

## Global Constraints

- NO modificar `prisma/schema.prisma` ni ejecutar migraciones (el schema ya tiene `Cursada`, `Horario`, `InscripcionMateria.cursadaId`, `LibroDeTema`, `ProfesorMateria`).
- `alumnoId` en requests de API = `Usuario.idUsuario` (id de cuenta). Las FKs a `Alumno` se resuelven con `src/utils/alumnoHelper.ts`.
- Errores de negocio con `new AppError(statusCode, mensaje)` (nuevo util) para que el `errorHandler` global devuelva 400/403/404. Mensajes en español, como el resto del proyecto.
- Respuestas: `{ success, data }`, `{ success, message, data }` y paginación `{ success, data, pagination: { page, limit, total, totalPages } }` (patrón `materiaController.listMaterias`).
- Validación Joi vía `validationMiddleware` (body/query) con `stripUnknown: true`.
- Roles: `ROLES.ADMINISTRATIVO`, `ROLES.PROFESOR`, `ROLES.ALUMNO` (string; `Usuario.rol` puede contener varios separados por coma).
- El proyecto no tiene test runner: la verificación de cada task es `npx tsc --noEmit` (0 errores) + revisión del diff. La verificación funcional E2E es la Task 7 (curl).
- Respeta `exactOptionalPropertyTypes: true`: nunca pasar `undefined` a campos opcionales en `data` de Prisma; usar `?? null`.

---

### Task 1: Repositorios — cursada (extender), libro de temas (nuevo) e InscripcionMateria.cursadaId

**Files:**
- Modify: `backend/src/repositories/cursadaRepository.ts` (agregar 2 métodos al final, antes de `export default`)
- Create: `backend/src/repositories/libroDeTemaRepository.ts`
- Modify: `backend/src/repositories/inscripcionMateriaRepository.ts:3-8` (interfaz) y `:18-27` (create)

**Interfaces:**
- Consumes: `prisma` de `../config/prisma.js`; `InscripcionMateriaCreateData` existente.
- Produces:
  - `CursadaRepository.findByMateriaAnioPeriodo(materiaId: number, anioLectivo: number, periodo: string): Promise<any>` — primera cursada (activa o no) con ese triplete.
  - `CursadaRepository.findInscriptosByCursadaId(cursadaId: number): Promise<any[]>` — `InscripcionMateria` ACTIVAS sin fechaBaja, con `alumno.usuario` (select: idUsuario, apellidoNombre, email, dni), orderBy `fechaInscripcion: 'asc'`.
  - `LibroDeTemaCreateData { materiaId: number; fecha: Date; temaDesarrollado: string; observaciones?: string | null }`
  - `LibroDeTemaUpdateData { fecha?: Date; temaDesarrollado?: string; observaciones?: string | null }`
  - `LibroDeTemaRepository.findAll(filters): Promise<{ data: any[]; pagination: { page; limit; total; totalPages } }>`
  - `LibroDeTemaRepository.create/findById/update/delete/findByMateriaId/isProfesorAsignado` (firmas exactas en el código de abajo).

- [ ] **Step 1: Extender `cursadaRepository.ts`**

Agregar al final de la clase `CursadaRepository` (línea 242, antes del cierre), los métodos:

```ts
  async findByMateriaAnioPeriodo(
    materiaId: number,
    anioLectivo: number,
    periodo: string
  ): Promise<any> {
    return await prisma.cursada.findFirst({
      where: {
        materiaId,
        anioLectivo,
        periodo: periodo as any
      }
    });
  }

  async findInscriptosByCursadaId(cursadaId: number): Promise<any[]> {
    return await prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        estado: 'ACTIVA',
        fechaBaja: null
      },
      include: {
        alumno: {
          include: {
            usuario: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true,
                dni: true
              }
            }
          }
        }
      },
      orderBy: { fechaInscripcion: 'asc' }
    });
  }
```

- [ ] **Step 2: Crear `libroDeTemaRepository.ts`**

```ts
import { prisma } from '../config/prisma.js';

export interface LibroDeTemaCreateData {
  materiaId: number;
  fecha: Date;
  temaDesarrollado: string;
  observaciones?: string | null;
}

export interface LibroDeTemaUpdateData {
  fecha?: Date;
  temaDesarrollado?: string;
  observaciones?: string | null;
}

export interface LibroDeTemaListFilters {
  page?: number;
  limit?: number;
  materiaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

const MATERIA_SELECT = {
  select: {
    id: true,
    nombre: true
  }
} as const;

class LibroDeTemaRepository {
  async create(data: LibroDeTemaCreateData): Promise<any> {
    return await prisma.libroDeTema.create({
      data: {
        materiaId: data.materiaId,
        fecha: data.fecha,
        temaDesarrollado: data.temaDesarrollado,
        observaciones: data.observaciones ?? null
      },
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.libroDeTema.findUnique({
      where: { idLibroDeTema: id },
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async update(id: number, data: LibroDeTemaUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.libroDeTema.update({
      where: { idLibroDeTema: id },
      data: cleanData,
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.libroDeTema.delete({
      where: { idLibroDeTema: id }
    });
  }

  async findByMateriaId(materiaId: number): Promise<any[]> {
    return await prisma.libroDeTema.findMany({
      where: { materiaId },
      include: {
        materia: MATERIA_SELECT
      },
      orderBy: { fecha: 'desc' }
    });
  }

  async findAll(filters: LibroDeTemaListFilters = {}): Promise<{
    data: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    const where: any = {};
    if (filters.materiaId) where.materiaId = filters.materiaId;
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fecha = {};
      if (filters.fechaDesde) where.fecha.gte = filters.fechaDesde;
      if (filters.fechaHasta) where.fecha.lte = filters.fechaHasta;
    }

    const [registros, total] = await Promise.all([
      prisma.libroDeTema.findMany({
        where,
        include: {
          materia: MATERIA_SELECT
        },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.libroDeTema.count({ where })
    ]);

    return {
      data: registros,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async isProfesorAsignado(profesorId: number, materiaId: number): Promise<boolean> {
    const asignacion = await prisma.profesorMateria.findFirst({
      where: {
        profesorId,
        materiaId,
        activo: true,
        fechaBaja: null
      }
    });
    return asignacion !== null;
  }
}

export default new LibroDeTemaRepository();
```

- [ ] **Step 3: Agregar `cursadaId` a `InscripcionMateriaCreateData` y su create**

En `inscripcionMateriaRepository.ts`, interfaz (líneas 3-8):

```ts
export interface InscripcionMateriaCreateData {
  alumnoId: number;
  materiaId: number;
  cicloLectivo: number;
  modalidadElegida: string;
  cursadaId?: number;
}
```

En `create` (líneas 20-27), agregar `cursadaId` al objeto `data`:

```ts
      data: {
        alumnoId: data.alumnoId,
        materiaId: data.materiaId,
        cicloLectivo: data.cicloLectivo,
        modalidadElegida: data.modalidadElegida as any,
        cursadaId: data.cursadaId ?? null,
        fechaInscripcion: new Date(),
        estado: 'ACTIVA'
      },
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/cursadaRepository.ts backend/src/repositories/libroDeTemaRepository.ts backend/src/repositories/inscripcionMateriaRepository.ts
git commit -m "feat: repos de cursadas inscriptos y libro de temas, cursadaId en inscripcion materia"
```

---

### Task 2: AppError + validaciones Joi

**Files:**
- Create: `backend/src/utils/AppError.ts`
- Create: `backend/src/validations/cursadaValidation.ts`
- Create: `backend/src/validations/libroDeTemaValidation.ts`

**Interfaces:**
- Consumes: nada (Joi ya está en `package.json`).
- Produces:
  - `AppError(statusCode: number, message: string)` — `extends Error` con `statusCode` (el `errorHandler` ya respeta `err.statusCode || 500`).
  - `createCursadaSchema`, `updateCursadaSchema`, `listCursadasSchema`, `createLibroDeTemaSchema`, `updateLibroDeTemaSchema`, `listLibroDeTemasSchema`.

- [ ] **Step 1: Crear `utils/AppError.ts`**

```ts
export class AppError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
```

- [ ] **Step 2: Crear `validations/cursadaValidation.ts`**

```ts
import Joi from 'joi';

const PERIODOS = ['ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE'];

export const createCursadaSchema = Joi.object({
  materiaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID de materia debe ser un número',
      'number.integer': 'El ID de materia debe ser un número entero',
      'number.min': 'El ID de materia debe ser mayor a 0',
      'any.required': 'El ID de materia es requerido'
    }),
  anioLectivo: Joi.number()
    .required()
    .integer()
    .min(2000)
    .max(2100)
    .messages({
      'number.base': 'El año lectivo debe ser un número',
      'number.integer': 'El año lectivo debe ser un número entero',
      'number.min': 'El año lectivo debe ser mayor o igual a 2000',
      'number.max': 'El año lectivo debe ser menor o igual a 2100',
      'any.required': 'El año lectivo es requerido'
    }),
  periodo: Joi.string()
    .valid(...PERIODOS)
    .default('ANUAL')
    .messages({
      'any.only': `Período inválido. Debe ser: ${PERIODOS.join(', ')}`
    }),
  docenteId: Joi.number().integer().min(1).allow(null)
});

export const updateCursadaSchema = Joi.object({
  materiaId: Joi.number().integer().min(1),
  anioLectivo: Joi.number().integer().min(2000).max(2100),
  periodo: Joi.string()
    .valid(...PERIODOS)
    .messages({
      'any.only': `Período inválido. Debe ser: ${PERIODOS.join(', ')}`
    }),
  docenteId: Joi.number().integer().min(1).allow(null),
  activo: Joi.boolean()
});

export const listCursadasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  anioLectivo: Joi.number().integer().min(2000).max(2100),
  materiaId: Joi.number().integer().min(1),
  docenteId: Joi.number().integer().min(1),
  activo: Joi.boolean()
});
```

- [ ] **Step 3: Crear `validations/libroDeTemaValidation.ts`**

```ts
import Joi from 'joi';

export const createLibroDeTemaSchema = Joi.object({
  materiaId: Joi.number()
    .required()
    .integer()
    .min(1)
    .messages({
      'number.base': 'El ID de materia debe ser un número',
      'number.integer': 'El ID de materia debe ser un número entero',
      'number.min': 'El ID de materia debe ser mayor a 0',
      'any.required': 'El ID de materia es requerido'
    }),
  fecha: Joi.date()
    .required()
    .messages({
      'date.base': 'La fecha debe ser una fecha válida (YYYY-MM-DD)',
      'any.required': 'La fecha es requerida'
    }),
  temaDesarrollado: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(5000)
    .messages({
      'string.empty': 'El tema desarrollado es requerido',
      'string.max': 'El tema desarrollado no puede exceder 5000 caracteres'
    }),
  observaciones: Joi.string().allow('', null).max(5000)
});

export const updateLibroDeTemaSchema = Joi.object({
  fecha: Joi.date().messages({
    'date.base': 'La fecha debe ser una fecha válida (YYYY-MM-DD)'
  }),
  temaDesarrollado: Joi.string().trim().min(1).max(5000),
  observaciones: Joi.string().allow('', null).max(5000)
});

export const listLibroDeTemasSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  materiaId: Joi.number().integer().min(1),
  fechaDesde: Joi.date().messages({
    'date.base': 'fechaDesde debe ser una fecha válida (YYYY-MM-DD)'
  }),
  fechaHasta: Joi.date().messages({
    'date.base': 'fechaHasta debe ser una fecha válida (YYYY-MM-DD)'
  })
});
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/AppError.ts backend/src/validations/cursadaValidation.ts backend/src/validations/libroDeTemaValidation.ts
git commit -m "feat: AppError y validaciones Joi de cursadas y libro de temas"
```

---

### Task 3: Services — cursadas, libro de temas y auto-vinculación al inscribir

**Files:**
- Create: `backend/src/services/cursadaService.ts`
- Create: `backend/src/services/libroDeTemaService.ts`
- Modify: `backend/src/services/inscripcionMateriaService.ts` (método `inscribirAlumno`)

**Interfaces:**
- Consumes: `cursadaRepository` (métodos existentes + Task 1), `libroDeTemaRepository` (Task 1), `userRepository.findById`, `materiaRepository.findById`, `AppError` (Task 2), `ROLES`, `cursadaRepository.getCursadaActivaByMateria`.
- Produces:
  - `cursadaService.createCursada(data, currentUser)`, `updateCursada(id, data, currentUser)`, `deleteCursada(id, currentUser)`, `getCursadas(filters)`, `getCursadaById(id)`, `getInscriptosByCursada(cursadaId)` — todos validan rol ADMIN (mutaciones) y lanzan `AppError`.
  - `libroDeTemaService.list(filters)`, `create(data, currentUser)`, `getById(id)`, `update(id, data, currentUser)`, `delete(id, currentUser)`, `getByMateria(materiaId)` — verificación de profesor asignado vía `isProfesorAsignado`.
  - Cambio en `inscripcionMateriaService.inscribirAlumno`: vincula `cursadaId` de la cursada activa si existe.

- [ ] **Step 1: Crear `services/cursadaService.ts`**

```ts
import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import userRepository from '../repositories/userRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import type { CursadaCreateData, CursadaUpdateData } from '../repositories/cursadaRepository.js';

class CursadaService {
  private esAdministrativo(currentUser: any): void {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden realizar esta acción');
    }
  }

  private async validarDatos(data: CursadaCreateData | CursadaUpdateData, cursadaIdExcluida?: number): Promise<void> {
    if ('materiaId' in data && data.materiaId !== undefined) {
      const materia = await materiaRepository.findById(data.materiaId);
      if (!materia) {
        throw new AppError(404, 'Materia no encontrada');
      }
    }

    if (data.docenteId !== undefined && data.docenteId !== null) {
      const docente = await userRepository.findById(data.docenteId);
      if (!docente) {
        throw new AppError(404, 'Docente no encontrado');
      }
      const tieneRolProfesor = (docente.rol ?? '')
        .split(',')
        .map((r: string) => r.trim())
        .includes(ROLES.PROFESOR);
      if (!tieneRolProfesor) {
        throw new AppError(400, 'El docente asignado debe tener rol PROFESOR');
      }
    }

    // La institución tiene UNA comisión por materia/año/periodo: rechazar duplicados
    const materiaId = 'materiaId' in data && data.materiaId !== undefined ? data.materiaId : undefined;
    const anioLectivo = data.anioLectivo;
    const periodo = data.periodo;
    if (materiaId && anioLectivo && periodo) {
      const existente = await cursadaRepository.findByMateriaAnioPeriodo(materiaId, anioLectivo, periodo);
      if (existente && existente.id !== cursadaIdExcluida) {
        throw new AppError(400, 'Ya existe una cursada de esa materia para ese año lectivo y periodo');
      }
    }
  }

  async createCursada(data: CursadaCreateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.validarDatos(data);
    return await cursadaRepository.create(data);
  }

  async getCursadas(filters: { page?: number; limit?: number; anioLectivo?: number; materiaId?: number; docenteId?: number; activo?: boolean } = {}) {
    return await cursadaRepository.findAll(filters);
  }

  async getCursadaById(id: number) {
    const cursada = await cursadaRepository.findById(id);
    if (!cursada) {
      throw new AppError(404, 'Cursada no encontrada');
    }
    return cursada;
  }

  async updateCursada(id: number, data: CursadaUpdateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.getCursadaById(id);
    await this.validarDatos(data, id);
    return await cursadaRepository.update(id, data);
  }

  async deleteCursada(id: number, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.getCursadaById(id);
    return await cursadaRepository.delete(id);
  }

  async getInscriptosByCursada(cursadaId: number) {
    await this.getCursadaById(cursadaId);
    return await cursadaRepository.findInscriptosByCursadaId(cursadaId);
  }
}

export default new CursadaService();
```

Nota: `cursadaRepository.findAll(filters)` ya acepta `{ anioLectivo?, materiaId?, docenteId?, activo? }` (Task 0, existente).

- [ ] **Step 2: Crear `services/libroDeTemaService.ts`**

```ts
import libroDeTemaRepository from '../repositories/libroDeTemaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import type {
  LibroDeTemaCreateData,
  LibroDeTemaUpdateData
} from '../repositories/libroDeTemaRepository.js';

class LibroDeTemaService {
  private async verificarPermisoProfesor(currentUser: any, materiaId: number): Promise<void> {
    if (currentUser.rol === ROLES.ADMINISTRATIVO) {
      return;
    }
    if (currentUser.rol !== ROLES.PROFESOR) {
      throw new AppError(403, 'No tienes permisos para realizar esta acción');
    }
    const asignado = await libroDeTemaRepository.isProfesorAsignado(currentUser.id, materiaId);
    if (!asignado) {
      throw new AppError(403, 'Solo el profesor asignado a la materia puede registrar temas');
    }
  }

  async list(filters: {
    page?: number;
    limit?: number;
    materiaId?: number;
    fechaDesde?: Date | string;
    fechaHasta?: Date | string;
  } = {}) {
    return await libroDeTemaRepository.findAll({
      page: filters.page,
      limit: filters.limit,
      materiaId: filters.materiaId,
      fechaDesde: filters.fechaDesde ? new Date(filters.fechaDesde) : undefined,
      fechaHasta: filters.fechaHasta ? new Date(filters.fechaHasta) : undefined
    });
  }

  async create(data: LibroDeTemaCreateData, currentUser: any) {
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }
    await this.verificarPermisoProfesor(currentUser, data.materiaId);
    return await libroDeTemaRepository.create(data);
  }

  async getById(id: number) {
    const registro = await libroDeTemaRepository.findById(id);
    if (!registro) {
      throw new AppError(404, 'Registro de libro de temas no encontrado');
    }
    return registro;
  }

  async update(id: number, data: LibroDeTemaUpdateData, currentUser: any) {
    const registro = await this.getById(id);
    await this.verificarPermisoProfesor(currentUser, registro.materiaId);
    return await libroDeTemaRepository.update(id, data);
  }

  async delete(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden eliminar registros del libro de temas');
    }
    await this.getById(id);
    return await libroDeTemaRepository.delete(id);
  }

  async getByMateria(materiaId: number) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }
    return await libroDeTemaRepository.findByMateriaId(materiaId);
  }
}

export default new LibroDeTemaService();
```

- [ ] **Step 3: Auto-vincular cursada en `inscripcionMateriaService.ts`**

Ubicar el final del método `inscribirAlumno` (hoy termina con):

```ts
    return await inscripcionMateriaRepository.create({ ...data, alumnoId: idAlumno });
```

Reemplazarlo por:

```ts
    // La institución tiene una sola comisión por materia: vincular la cursada
    // activa de la materia en el ciclo lectivo si existe (si no, queda NULL)
    const cursada = await cursadaRepository.getCursadaActivaByMateria(data.materiaId, data.cicloLectivo);

    return await inscripcionMateriaRepository.create({
      ...data,
      alumnoId: idAlumno,
      cursadaId: cursada?.id ?? null
    });
```

Y agregar el import al inicio del archivo (junto a los otros imports de repositorios):

```ts
import cursadaRepository from '../repositories/cursadaRepository.js';
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cursadaService.ts backend/src/services/libroDeTemaService.ts backend/src/services/inscripcionMateriaService.ts
git commit -m "feat: services de cursadas y libro de temas, auto-vincular cursada al inscribir"
```

---

### Task 4: Controllers

**Files:**
- Create: `backend/src/controllers/cursadaController.ts`
- Create: `backend/src/controllers/libroDeTemaController.ts`

**Interfaces:**
- Consumes: `cursadaService`, `libroDeTemaService` (Task 3).
- Produces: handlers Express `(req, res, next): Promise<void>` con formato de respuesta del proyecto y parseo de params/query en el controller.

- [ ] **Step 1: Crear `controllers/cursadaController.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import cursadaService from '../services/cursadaService.js';

function parseId(req: Request, res: Response, nombre: string = 'ID'): number | null {
  const value = parseInt(req.params.id);
  if (isNaN(value)) {
    res.status(400).json({
      success: false,
      message: `${nombre} inválido`
    });
    return null;
  }
  return value;
}

class CursadaController {
  async createCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursada = await cursadaService.createCursada(req.body, req.user!);
      res.status(201).json({
        success: true,
        message: 'Cursada creada exitosamente',
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async listCursadas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};
      if (req.query.anioLectivo) filters.anioLectivo = parseInt(req.query.anioLectivo as string);
      if (req.query.materiaId) filters.materiaId = parseInt(req.query.materiaId as string);
      if (req.query.docenteId) filters.docenteId = parseInt(req.query.docenteId as string);
      if (req.query.activo !== undefined) filters.activo = req.query.activo === 'true';

      const result = await cursadaService.getCursadas(filters);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getCursadaById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const cursada = await cursadaService.getCursadaById(id);
      res.json({
        success: true,
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const cursada = await cursadaService.updateCursada(id, req.body, req.user!);
      res.json({
        success: true,
        message: 'Cursada actualizada exitosamente',
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      await cursadaService.deleteCursada(id, req.user!);
      res.json({
        success: true,
        message: 'Cursada eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getInscriptosByCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const inscriptos = await cursadaService.getInscriptosByCursada(id);
      res.json({
        success: true,
        data: inscriptos
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CursadaController();
```

- [ ] **Step 2: Crear `controllers/libroDeTemaController.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import libroDeTemaService from '../services/libroDeTemaService.js';

function parseId(req: Request, res: Response, nombre: string = 'ID'): number | null {
  const value = parseInt(req.params.id);
  if (isNaN(value)) {
    res.status(400).json({
      success: false,
      message: `${nombre} inválido`
    });
    return null;
  }
  return value;
}

class LibroDeTemaController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};
      if (req.query.materiaId) filters.materiaId = parseInt(req.query.materiaId as string);
      if (req.query.fechaDesde) filters.fechaDesde = req.query.fechaDesde as string;
      if (req.query.fechaHasta) filters.fechaHasta = req.query.fechaHasta as string;

      const result = await libroDeTemaService.list(filters);
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fecha = new Date(req.body.fecha);
      const registro = await libroDeTemaService.create(
        { ...req.body, fecha },
        req.user!
      );
      res.status(201).json({
        success: true,
        message: 'Registro del libro de temas creado exitosamente',
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      const registro = await libroDeTemaService.getById(id);
      res.json({
        success: true,
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      const data: any = { ...req.body };
      if (data.fecha) data.fecha = new Date(data.fecha);

      const registro = await libroDeTemaService.update(id, data, req.user!);
      res.json({
        success: true,
        message: 'Registro del libro de temas actualizado exitosamente',
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      await libroDeTemaService.delete(id, req.user!);
      res.json({
        success: true,
        message: 'Registro del libro de temas eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getByMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const materiaId = parseInt(req.params.materiaId);
      if (isNaN(materiaId)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const registros = await libroDeTemaService.getByMateria(materiaId);
      res.json({
        success: true,
        data: registros
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new LibroDeTemaController();
```

Nota: el service de libro ya parsea `fechaDesde`/`fechaHasta` (acepta string ISO). Mantener el filtrado de fechas en el service para no duplicar lógica.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/cursadaController.ts backend/src/controllers/libroDeTemaController.ts
git commit -m "feat: controllers de cursadas y libro de temas"
```

---

### Task 5: Rutas + registro en index

**Files:**
- Create: `backend/src/routes/cursadaRoutes.ts`
- Create: `backend/src/routes/libroDeTemaRoutes.ts`
- Modify: `backend/src/routes/index.ts`

**Interfaces:**
- Consumes: controllers (Task 4), validaciones (Task 2), `authMiddleware`, `roleCheck`, `ROLES`, `validationMiddleware`.
- Produces: routers montados en `/cursadas` y `/libro-de-temas`; listado de endpoints en `GET /`.

- [ ] **Step 1: Crear `routes/cursadaRoutes.ts`**

```ts
import { Router } from 'express';
import cursadaController from '../controllers/cursadaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  createCursadaSchema,
  updateCursadaSchema,
  listCursadasSchema
} from '../validations/cursadaValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Listar cursadas (admin o profesor)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listCursadasSchema, 'query'),
  cursadaController.listCursadas
);

// Crear cursada (solo admin)
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createCursadaSchema),
  cursadaController.createCursada
);

// Detalle (admin o profesor)
router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  cursadaController.getCursadaById
);

// Actualizar (solo admin)
router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateCursadaSchema),
  cursadaController.updateCursada
);

// Baja lógica (solo admin)
router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  cursadaController.deleteCursada
);

// Alumnos inscriptos a la comisión (admin o profesor)
router.get('/:id/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  cursadaController.getInscriptosByCursada
);

export default router;
```

- [ ] **Step 2: Crear `routes/libroDeTemaRoutes.ts`**

```ts
import { Router } from 'express';
import libroDeTemaController from '../controllers/libroDeTemaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  createLibroDeTemaSchema,
  updateLibroDeTemaSchema,
  listLibroDeTemasSchema
} from '../validations/libroDeTemaValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Listar registros (admin o profesor)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listLibroDeTemasSchema, 'query'),
  libroDeTemaController.list
);

// Crear registro (admin o profesor de la materia)
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(createLibroDeTemaSchema),
  libroDeTemaController.create
);

// Registros por materia (admin o profesor)
router.get('/materia/:materiaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  libroDeTemaController.getByMateria
);

// Detalle (admin o profesor)
router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  libroDeTemaController.getById
);

// Actualizar (admin o profesor de la materia)
router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(updateLibroDeTemaSchema),
  libroDeTemaController.update
);

// Eliminar (solo admin)
router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  libroDeTemaController.delete
);

export default router;
```

- [ ] **Step 3: Registrar en `routes/index.ts`**

Agregar imports (después de la línea 13 `import periodoInscripcionRoutes ...`):

```ts
import cursadaRoutes from './cursadaRoutes.js';
import libroDeTemaRoutes from './libroDeTemaRoutes.js';
```

Montar (después de la línea 41 `router.use('/periodos-inscripcion', ...)`):

```ts
// Rutas de cursadas
router.use('/cursadas', cursadaRoutes);

// Rutas de libro de temas
router.use('/libro-de-temas', libroDeTemaRoutes);
```

Actualizar el listado raíz (objeto `endpoints`, líneas 55-68):

```ts
      horarios: '/api/horarios',
      cursadas: '/api/cursadas',
      libroDeTemas: '/api/libro-de-temas',
      periodosInscripcion: '/api/periodos-inscripcion',
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/cursadaRoutes.ts backend/src/routes/libroDeTemaRoutes.ts backend/src/routes/index.ts
git commit -m "feat: rutas de cursadas y libro de temas"
```

---

### Task 6: OpenAPI — paths y schemas de Cursadas

**Files:**
- Modify: `backend/openapi.yaml`

**Interfaces:**
- Consumes: convenciones existentes del openapi (`tags`, `x-roles`, `#/components/responses/OK|Created|PaginatedOK`).
- Produces: tag `Cursadas`, 6 paths, 2 schemas (contrato consistente con el código).

- [ ] **Step 1: Agregar el tag**

En la sección `tags:` (líneas 20-34), después de `- name: Materias`:

```yaml
  - name: Cursadas
```

- [ ] **Step 2: Agregar los paths**

Insertar después del bloque `# ========================= HORARIOS =========================` (que termina en la línea ~1007 con `/horarios/materia/{materiaId}`) y antes de `# ========================= LIBRO DE TEMAS =========================`:

```yaml
  # ========================= CURSADAS =========================
  /cursadas:
    get:
      tags: [Cursadas]
      summary: Listar cursadas (admin o profesor)
      x-roles: [ADMINISTRATIVO, PROFESOR]
      parameters:
        - { name: anioLectivo, in: query, schema: { type: integer } }
        - { name: materiaId, in: query, schema: { type: integer } }
        - { name: docenteId, in: query, schema: { type: integer } }
        - { name: activo, in: query, schema: { type: boolean } }
      responses:
        '200': { $ref: '#/components/responses/OK' }
    post:
      tags: [Cursadas]
      summary: Crear cursada (solo admin)
      x-roles: [ADMINISTRATIVO]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CursadaRequest' }
      responses:
        '201': { $ref: '#/components/responses/Created' }

  /cursadas/{id}:
    get:
      tags: [Cursadas]
      summary: Obtener cursada por ID (admin o profesor)
      x-roles: [ADMINISTRATIVO, PROFESOR]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { $ref: '#/components/responses/OK' }
    put:
      tags: [Cursadas]
      summary: Actualizar cursada (solo admin)
      x-roles: [ADMINISTRATIVO]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CursadaUpdateRequest' }
      responses:
        '200': { $ref: '#/components/responses/OK' }
    delete:
      tags: [Cursadas]
      summary: Eliminar cursada (baja lógica, solo admin)
      x-roles: [ADMINISTRATIVO]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { $ref: '#/components/responses/OK' }

  /cursadas/{id}/inscriptos:
    get:
      tags: [Cursadas]
      summary: Alumnos inscriptos a una cursada (admin o profesor)
      x-roles: [ADMINISTRATIVO, PROFESOR]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { $ref: '#/components/responses/OK' }
```

- [ ] **Step 3: Agregar los schemas**

En `components.schemas`, junto a los schemas de Horarios (donde está `HorarioRequest`, ~línea 1510), agregar:

```yaml
    # -------- Cursadas --------
    CursadaRequest:
      type: object
      required: [materiaId, anioLectivo]
      properties:
        materiaId: { type: integer, minimum: 1 }
        anioLectivo: { type: integer, minimum: 2000, maximum: 2100 }
        periodo:
          type: string
          enum: [ANUAL, PRIMER_CUATRIMESTRE, SEGUNDO_CUATRIMESTRE]
          default: ANUAL
        docenteId: { type: integer, minimum: 1, nullable: true }
    CursadaUpdateRequest:
      type: object
      properties:
        materiaId: { type: integer, minimum: 1 }
        anioLectivo: { type: integer, minimum: 2000, maximum: 2100 }
        periodo:
          type: string
          enum: [ANUAL, PRIMER_CUATRIMESTRE, SEGUNDO_CUATRIMESTRE]
        docenteId: { type: integer, minimum: 1, nullable: true }
        activo: { type: boolean }
```

- [ ] **Step 4: Validar el YAML**

Run: `npx tsx -e "import { readFileSync } from 'fs'; console.log('ok')"` (sanity check de que el archivo no rompió imports) — la validación estructural de YAML se hace al arrancar con `npm run dev` en la Task 7.

- [ ] **Step 5: Commit**

```bash
git add backend/openapi.yaml
git commit -m "docs(openapi): endpoints de cursadas"
```

---

### Task 7: Verificación E2E

**Files:**
- Ninguno (solo ejecución).

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit` en `backend/`
Expected: 0 errores.

- [ ] **Step 2: Arrancar el servidor**

Run: `npm run dev` en `backend/` (en una terminal aparte; el puerto es 3000).
Expected: log de arranque sin errores (`API Instituto Académico` o similar).

- [ ] **Step 3: Probar el flujo de cursadas**

Con el token de admin (login + select-role, o el flujo que usa Bruno con `admin.test@instituto.edu`):

```bash
# Crear cursada (reemplazar TOKEN, MATERIA_ID y DOCENTE_ID por valores reales de la BD)
curl -s -X POST http://localhost:3000/api/cursadas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"materiaId": 1, "anioLectivo": 2026, "periodo": "ANUAL", "docenteId": 2}'
```
Expected: `201` + `{ success: true, message: 'Cursada creada exitosamente', data: {...} }`

```bash
# Listar
curl -s http://localhost:3000/api/cursadas -H "Authorization: Bearer $TOKEN"
```
Expected: `200` con el listado (verificar `materia`, `docente`, `horarios` y `_count`).

```bash
# Duplicado -> 400
curl -s -X POST http://localhost:3000/api/cursadas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"materiaId": 1, "anioLectivo": 2026, "periodo": "ANUAL"}'
```
Expected: `400` + mensaje de duplicado.

```bash
# Detalle e inscriptos
curl -s http://localhost:3000/api/cursadas/1 -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/cursadas/1/inscriptos -H "Authorization: Bearer $TOKEN"
```
Expected: `200`; `inscriptos` devuelve los alumnos con `alumno.usuario` (puede ser `[]` si todavía no hay inscripciones vinculadas).

```bash
# Actualizar y baja lógica
curl -s -X PUT http://localhost:3000/api/cursadas/1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"docenteId": null}'
curl -s -X DELETE http://localhost:3000/api/cursadas/1 -H "Authorization: Bearer $TOKEN"
```
Expected: `200`; al listar con `?activo=false` o `GET /cursadas/1` el `activo` queda `false`.

- [ ] **Step 4: Probar auto-vinculación de cursada en inscripción**

Con token de alumno (o admin):

```bash
curl -s -X POST http://localhost:3000/api/inscripciones-materias \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"alumnoId": 3, "materiaId": 1, "cicloLectivo": 2026, "modalidadElegida": "PRESENCIAL"}'
```
Expected: `201` y en `data` el campo `cursadaId` apuntando a la cursada creada en el Step 3 (si la cursada está `activa`). La misma llamada sin cursada activa deja `cursadaId: null`.

- [ ] **Step 5: Probar libro de temas**

```bash
# Crear (admin)
curl -s -X POST http://localhost:3000/api/libro-de-temas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"materiaId": 1, "fecha": "2026-08-19", "temaDesarrollado": "Unidad 1: Introducción", "observaciones": "Aula 5"}'
```
Expected: `201` + registro con `materia` anidada.

```bash
# Crear con profesor NO asignado a la materia -> 403
curl -s -X POST http://localhost:3000/api/libro-de-temas \
  -H "Authorization: Bearer $PROFESOR_TOKEN" -H "Content-Type: application/json" \
  -d '{"materiaId": 1, "fecha": "2026-08-19", "temaDesarrollado": "X"}'
```
Expected: `403` + 'Solo el profesor asignado a la materia puede registrar temas'.

```bash
# Listar con paginación y filtros
curl -s "http://localhost:3000/api/libro-de-temas?materiaId=1&page=1&limit=5" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3000/api/libro-de-temas/materia/1" -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/libro-de-temas/1 -H "Authorization: Bearer $TOKEN"
curl -s -X PUT http://localhost:3000/api/libro-de-temas/1 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"observaciones": "Actualizado"}'
curl -s -X DELETE http://localhost:3000/api/libro-de-temas/1 -H "Authorization: Bearer $TOKEN"
```
Expected: `200` en cada uno (listado con `pagination`, detalle, PUT con datos actualizados, DELETE `200`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: verificación E2E de cursadas y libro de temas"
```
(Solo si hubo ajustes de código; si no hubo cambios, no commitear.)
```