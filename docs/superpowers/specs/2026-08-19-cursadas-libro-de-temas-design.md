# Diseño: Endpoints de Cursadas y Libro de Temas

Fecha: 2026-08-19
Estado: Aprobado por el usuario
Ámbito: `backend/` (Express + TypeScript + Prisma + MySQL)

## Contexto

El schema Prisma define los modelos `Cursada` y `LibroDeTema`, y el openapi define
los endpoints de `/libro-de-temas`, pero no existe código para ninguno de los dos
(excepto `repositories/cursadaRepository.ts`, que ya está completo y en uso por
`horarioService` y `inscripcionMateriaService`).

La institución tiene **una sola comisión (cursada) por materia**: nunca hay más de
una cursada activa por materia/año lectivo. Por eso, cuando un alumno se inscribe a
una materia, debe quedar vinculado automáticamente a la cursada de esa materia.

## Decisiones

- `Cursada` = comisión de una materia en un año lectivo, con docente, periodo y
  horarios. NO es "alumnos por carrera" (eso es `InscripcionCarrera`) ni "alumnos
  por materia" (eso es `InscripcionMateria`, ya expuesto).
- `alumnoId` en la API sigue siendo el id de cuenta (`Usuario.idUsuario`); las FKs
  de `InscripcionMateria`/`Asistencia`/`Calificacion` apuntan a `Alumno.idAlumno` y
  se resuelven con `utils/alumnoHelper.ts` (ya existente).
- El openapi se actualiza para incluir el CRUD de `/cursadas` y mantener el
  contrato consistente con el código (decisión del usuario).
- La auto-vinculación de cursada al inscribirse es "si existe, se asigna; si no, la
  inscripción se crea igual con `cursadaId: NULL`" (decisión del usuario).

## Modelos de referencia

```prisma
model Cursada {
  id          Int
  materiaId   Int
  anioLectivo Int
  periodo     PeriodoMateria @default(ANUAL)   // ANUAL, PRIMER_CUATRIMESTRE, SEGUNDO_CUATRIMESTRE
  docenteId   Int?           // -> Usuario.idUsuario
  activo      Boolean        @default(true)
  @@unique([materiaId, anioLectivo, periodo])
}

model LibroDeTema {
  idLibroDeTema    Int
  materiaId        Int
  fecha            DateTime @db.Date
  temaDesarrollado String
  observaciones    String?
}
```

`cursadaRepository` ya implementa: `create`, `findById`, `findByMateriaId`,
`findByDocenteId`, `findAll`, `update`, `delete` (baja lógica), `hardDelete`,
`getCursadaActivaByMateria`. No se toca.

## Endpoints

### CRUD `/cursadas` (nuevo; se agrega a openapi.yaml)

| Ruta | Método | Roles | Descripción |
|---|---|---|---|
| `/cursadas` | GET | ADMIN, PROFESOR | Listar. Filtros query: `anioLectivo`, `materiaId`, `docenteId`, `activo` |
| `/cursadas` | POST | ADMIN | Crear comisión: `{ materiaId, anioLectivo, periodo, docenteId? }` |
| `/cursadas/{id}` | GET | ADMIN, PROFESOR | Detalle (materia, docente, horarios activos) |
| `/cursadas/{id}` | PUT | ADMIN | Actualizar campos (incl. `activo`). Rechaza duplicado `[materiaId, anioLectivo, periodo]` |
| `/cursadas/{id}` | DELETE | ADMIN | Baja lógica: `activo = false` |
| `/cursadas/{id}/inscriptos` | GET | ADMIN, PROFESOR | Alumnos inscriptos a la comisión vía `InscripcionMateria.cursadaId` (estado ACTIVA, sin fechaBaja), con datos de cuenta anidados (`usuario`) |

Nota: la ruta `/{id}/inscriptos` no estaba en openapi; se agrega junto con el CRUD.

### `/libro-de-temas` (según openapi existente)

| Ruta | Método | Roles | Descripción |
|---|---|---|---|
| `/libro-de-temas` | GET | ADMIN, PROFESOR | Paginado (`page`, `limit` max 100) + filtros `materiaId`, `fechaDesde`, `fechaHasta`. Respuesta paginada (formato del resto del proyecto) |
| `/libro-de-temas` | POST | ADMIN, PROFESOR* | Crear: `{ materiaId, fecha, temaDesarrollado, observaciones? }` |
| `/libro-de-temas/{id}` | GET | ADMIN, PROFESOR | Detalle |
| `/libro-de-temas/{id}` | PUT | ADMIN, PROFESOR* | Actualizar: `{ fecha?, temaDesarrollado?, observaciones? }` |
| `/libro-de-temas/{id}` | DELETE | ADMIN | Eliminar registro |
| `/libro-de-temas/materia/{materiaId}` | GET | ADMIN, PROFESOR | Registros de una materia (ordenados por fecha desc) |

\* Profesor: solo de materias asignadas (ver reglas de negocio).

## Reglas de negocio

1. **Crear/actualizar cursada**: la materia debe existir (`materiaRepository.findById`).
   Si viene `docenteId`, el usuario debe existir y su `rol` debe contener `PROFESOR`.
   Duplicado `[materiaId, anioLectivo, periodo]` → error con mensaje claro (400).
2. **Baja de cursada**: si hay inscripciones activas, `activo = false` deja la
   cursada inactiva; las inscripciones existentes se conservan (el schema no
   restringe esto). No se valida inscriptos previos.
3. **Libro de temas — propiedad**: si `currentUser.rol` es `PROFESOR` (y no ADMIN),
   debe existir una `ProfesorMateria` activa (`profesorId = currentUser.id`,
   `materiaId = <materia del registro>`, `activo = true`) para crear o editar.
   ADMIN no tiene restricción. Al editar/eliminar, el registro se busca por `id`
   primero (404 si no existe) para obtener su `materiaId`.
4. **Fechas**: `fecha` del libro llega como string ISO (`format: date`); se convierte
   con `new Date()` y Prisma la persiste como `@db.Date`.
5. **Auto-vinculación de cursada**: en `inscripcionMateriaService.inscribirAlumno`,
   después de validar correlatividades, se llama a
   `cursadaRepository.getCursadaActivaByMateria(data.materiaId, cicloLectivo)`; si
   devuelve una cursada, se crea la inscripción con `cursadaId`; si no, con `NULL`
   (comportamiento actual). La inscripción nunca se rechaza por falta de cursada.
6. **Respuestas y errores**: mismo formato del proyecto
   (`{ success, message, data }`), errores con `new Error(...)` y el `errorHandler`
   global (400 para P2002/P2003, 404 para P2025).
7. **Validación Joi** con `validationMiddleware` (patrón de `materias`/`carreras`):
   - `cursadaValidation.ts`: `createCursadaSchema`, `updateCursadaSchema`,
     `listCursadasSchema`.
   - `libroDeTemaValidation.ts`: `createLibroDeTemaSchema`,
     `updateLibroDeTemaSchema`, `listLibroDeTemasSchema` (query).

## Arquitectura

Patrón por capas del proyecto (ej.: `materias`). Archivos:

```
repositories/libroDeTemaRepository.ts   NUEVO (create, findById, update, delete,
                                        findByMateriaId, findAll con filtros+paginación)
services/cursadaService.ts              NUEVO (CRUD + validaciones de negocio + inscriptos)
services/libroDeTemaService.ts          NUEVO (CRUD + propiedad profesor + paginación)
controllers/cursadaController.ts        NUEVO
controllers/libroDeTemaController.ts    NUEVO
routes/cursadaRoutes.ts                 NUEVO (authMiddleware + roleCheck + validationMiddleware)
routes/libroDeTemaRoutes.ts             NUEVO
validations/cursadaValidation.ts        NUEVO
validations/libroDeTemaValidation.ts    NUEVO
routes/index.ts                         MODIFICAR: registrar ambas rutas + listado raíz
services/inscripcionMateriaService.ts   MODIFICAR: auto-vincular cursada activa
openapi.yaml                            MODIFICAR: paths /cursadas + schemas + tag
repositories/cursadaRepository.ts       MODIFICAR: agregar findInscriptosByCursadaId
```

**Paginación**: mismo formato que `materias` — respuesta `{ success, data, pagination }`
con `pagination: { page, limit, total, totalPages }` (`totalPages = Math.ceil(total / limit)`),
y conteo con `prisma.<model>.count({ where })` en paralelo al `findMany` (patrón de
`materiaRepository.findAll`).

`cursadaRepository` necesita un método nuevo para inscriptos por cursada
(`findInscriptosByCursadaId`), que consulta `InscripcionMateria` con `cursadaId`,
`estado: ACTIVA`, `fechaBaja: null` e incluye `alumno.usuario` (select con
`idUsuario`, `apellidoNombre`, `email`, `dni`) y `materia`.

## Buenas prácticas (patrón del proyecto / MVC por capas)

El proyecto separa responsabilidades en: `validations` (Joi) → `routes` (auth/roles/
validación) → `controllers` (parseo de request/response, sin lógica de negocio) →
`services` (reglas de negocio, permisos, errores con mensaje claro) →
`repositories` (solo acceso a datos con Prisma, tipado de inputs con interfaces).

Este trabajo debe mantener ese patrón y además:

1. **Tipado**: los métodos del repo reciben interfaces (`CursadaCreateData`,
   `LibroDeTemaCreateData`, etc.) exportadas; evitar `any` en firmas nuevas cuando
   el tipo del cliente de Prisma lo permite; `as const`/`satisfies` para enums de
   Prisma en vez de `as any` donde sea razonable.
2. **Sin lógica de negocio en repos**: los repos solo construyen queries; "el
   profesor solo puede editar materias asignadas" vive en el service.
3. **Reutilizar antes de crear**: `materiaRepository.findById`, `userRepository.findById`,
   `getAlumnoIdByUsuarioId`, `getCursadaActivaByMateria`; no duplicar queries.
4. **Transacciones**: solo si una operación toca varias tablas (no es el caso aquí;
   cada endpoint es una escritura simple).
5. **Mensajes de error específicos y en español** (convención del proyecto), nunca
   exponer trazas de Prisma (ya lo maneja `errorHandler`).
6. **Orden de rutas Express**: declarar rutas estáticas/paramétricas específicas
   (`/materia/:materiaId`, `/{id}/inscriptos`) ANTES de las rutas con parámetro
   genérico (`/:id`) para evitar que `/` capture segmentos.
7. **IDs**: `docenteId` de cursada y perfiles en servicios se manejan como
   `idUsuario`; la conversión a `idAlumno` solo cuando la FK lo exige
   (`Asistencia`, `Calificacion`, `InscripcionMateria`).
8. **Joi**: `stripUnknown: true` (ya lo hace `validationMiddleware`) para que no
   entren campos no declarados al body.

## Esquemas openapi agregados

- `CursadaRequest` (POST): `materiaId` (int, min 1), `anioLectivo` (int),
  `periodo` (enum `PeriodoMateria`), `docenteId` (int, nullable, min 1).
- `CursadaUpdateRequest` (PUT): mismos campos opcionales + `activo` (bool).
- `Cursada` (entidad de respuesta): id, materiaId, anioLectivo, periodo, docenteId,
  activo, createdAt, updatedAt.
- Tag nuevo `Cursadas` con las 6 rutas; respuestas reutilizando
  `#/components/responses/OK`, `Created`, `PaginatedOK` según corresponda.

## Verificación

1. `npx tsc --noEmit` sin errores.
2. Levantar servidor (`npm run dev`) y probar con Bruno:
   - Login admin → `POST /cursadas` → `GET /cursadas/{id}` → `GET /cursadas/{id}/inscriptos`.
   - `POST /inscripciones-materias` (alumno) con cursada existente → verificar
     `cursadaId` asignado en la respuesta.
   - `POST /libro-de-temas` (admin y profesor asignado/no asignado) → 201/403.
   - `GET /libro-de-temas` con filtros y paginación.

## Fuera de alcance

- CRUD de `Asistencia` y `Calificacion` (tablas relacionadas; requieren decisión aparte).
- Auto-creación de cursadas al inscribir alumnos.
- Cambiar el schema Prisma (no se toca).
