-- ============================================
-- MIGRACIÓN 1: Estructura principal
-- ============================================

-- Usuario
CREATE TABLE `Usuario` (
    `idUsuario` INTEGER NOT NULL AUTO_INCREMENT,
    `apellidoNombre` VARCHAR(255) NOT NULL,
    `dni` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `fechaNacimiento` DATE NOT NULL,
    `telefono` VARCHAR(20) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `cuil` VARCHAR(11) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `rol` VARCHAR(255) NOT NULL,
    `contactoEmergencia` VARCHAR(255) NULL,
    `foto` VARCHAR(255) NULL,
    `ultimo_acceso` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Usuario_dni_key`(`dni`),
    UNIQUE INDEX `Usuario_email_key`(`email`),
    UNIQUE INDEX `Usuario_cuil_key`(`cuil`),
    PRIMARY KEY (`idUsuario`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Alumno
CREATE TABLE `Alumno` (
    `idAlumno` INTEGER NOT NULL AUTO_INCREMENT,
    `idCuenta` INTEGER NOT NULL,
    `domicilio` VARCHAR(255) NOT NULL,
    `institucionProcedencia` VARCHAR(255) NULL,
    `adeudaMateria` BOOLEAN NOT NULL DEFAULT false,
    `anioEgreso` INTEGER NOT NULL,

    UNIQUE INDEX `Alumno_idCuenta_key`(`idCuenta`),
    PRIMARY KEY (`idAlumno`),
    CONSTRAINT `Alumno_idCuenta_fkey` FOREIGN KEY (`idCuenta`) REFERENCES `Usuario`(`idUsuario`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Carrera
CREATE TABLE `carreras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NOT NULL,
    `duracion_anios` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `carreras_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Curso
CREATE TABLE `cursos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `anio` INTEGER NOT NULL,
    `descripcion` VARCHAR(255) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cursos_anio_descripcion_key`(`anio`, `descripcion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- EspacioCurricular
CREATE TABLE `espacios_curriculares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NOT NULL,
    `descripcion` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `espacios_curriculares_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- PlanEstudio
CREATE TABLE `planes_estudio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carrera_id` INTEGER NOT NULL,
    `anio` INTEGER NOT NULL,
    `descripcion` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `planes_estudio_carrera_id_anio_key`(`carrera_id`, `anio`),
    PRIMARY KEY (`id`),
    CONSTRAINT `planes_estudio_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Materia (sin campo codigo)
CREATE TABLE `materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NOT NULL,
    `descripcion` TEXT NULL,
    `carga_horaria` INTEGER NOT NULL,
    `horas_catedra` VARCHAR(50) NULL,
    `tipo_espacio` VARCHAR(191) NOT NULL DEFAULT 'MATERIA',
    `modalidad` VARCHAR(191) NULL DEFAULT 'PRESENCIAL',
    `periodo` VARCHAR(191) NULL DEFAULT 'ANUAL',
    `regimen` VARCHAR(191) NULL DEFAULT 'REGULAR_PRESENCIAL_SIN_PROMOCION',
    `nota_minima` DOUBLE NULL DEFAULT 6,
    `asistencia_requerida` DOUBLE NULL DEFAULT 75,
    `tp_requeridos` DOUBLE NULL DEFAULT 75,
    `es_promocionable` BOOLEAN NOT NULL DEFAULT false,
    `nota_promocion` DOUBLE NULL DEFAULT 8,
    `anios_regularidad` INTEGER NULL DEFAULT 3,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `carrera_id` INTEGER NOT NULL,
    `curso_id` INTEGER NULL,
    `espacio_curricular_id` INTEGER NULL,
    `plan_estudio_id` INTEGER NULL,

    PRIMARY KEY (`id`),
    CONSTRAINT `materias_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `materias_curso_id_fkey` FOREIGN KEY (`curso_id`) REFERENCES `cursos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `materias_espacio_curricular_id_fkey` FOREIGN KEY (`espacio_curricular_id`) REFERENCES `espacios_curriculares`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `materias_plan_estudio_id_fkey` FOREIGN KEY (`plan_estudio_id`) REFERENCES `planes_estudio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlumnoCurso
CREATE TABLE `alumnos_cursos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `curso_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `alumnos_cursos_alumno_id_curso_id_key`(`alumno_id`, `curso_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `alumnos_cursos_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `alumnos_cursos_curso_id_fkey` FOREIGN KEY (`curso_id`) REFERENCES `cursos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlumnoEspacioCurricular
CREATE TABLE `alumnos_espacios_curriculares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `espacio_curricular_id` INTEGER NOT NULL,
    `promedio` DOUBLE NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Índice único con nombre corto
    UNIQUE INDEX `alumnos_espacios_curriculares_unique`(`alumno_id`, `espacio_curricular_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `alumnos_espacios_curriculares_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `alumnos_espacios_curriculares_espacio_curricular_id_fkey` FOREIGN KEY (`espacio_curricular_id`) REFERENCES `espacios_curriculares`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Correlatividad
CREATE TABLE `correlatividades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_origen_id` INTEGER NOT NULL,
    `materia_requerida_id` INTEGER NOT NULL,
    `tipo_requisito` VARCHAR(191) NOT NULL DEFAULT 'OBLIGATORIA',
    `grupo` VARCHAR(100) NULL,
    `cantidad_minima_aprobadas` INTEGER NULL,
    `aplica_cursado` BOOLEAN NOT NULL DEFAULT true,
    `aplica_rendir` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- Índice único con nombre corto
    UNIQUE INDEX `correlatividades_origen_requerida_grupo_unique`(`materia_origen_id`, `materia_requerida_id`, `grupo`),
    PRIMARY KEY (`id`),
    CONSTRAINT `correlatividades_materia_origen_id_fkey` FOREIGN KEY (`materia_origen_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `correlatividades_materia_requerida_id_fkey` FOREIGN KEY (`materia_requerida_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cursada
CREATE TABLE `cursadas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_id` INTEGER NOT NULL,
    `anio_lectivo` INTEGER NOT NULL,
    `periodo` VARCHAR(191) NOT NULL DEFAULT 'ANUAL',
    `docente_id` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cursadas_materia_id_anio_lectivo_periodo_key`(`materia_id`, `anio_lectivo`, `periodo`),
    PRIMARY KEY (`id`),
    CONSTRAINT `cursadas_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `cursadas_docente_id_fkey` FOREIGN KEY (`docente_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- InscripcionCarrera
CREATE TABLE `inscripciones_carreras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `carrera_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `ciclo_lectivo` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inscripciones_carreras_usuario_id_carrera_id_key`(`usuario_id`, `carrera_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `inscripciones_carreras_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `inscripciones_carreras_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- InscripcionMateria
CREATE TABLE `inscripciones_materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `ciclo_lectivo` INTEGER NOT NULL,
    `modalidad_elegida` VARCHAR(191) NOT NULL DEFAULT 'PRESENCIAL',
    `estado` VARCHAR(191) NOT NULL DEFAULT 'ACTIVA',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `cursada_id` INTEGER NULL,

    UNIQUE INDEX `inscripciones_materias_alumno_id_materia_id_ciclo_lectivo_key`(`alumno_id`, `materia_id`, `ciclo_lectivo`),
    PRIMARY KEY (`id`),
    CONSTRAINT `inscripciones_materias_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `inscripciones_materias_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `inscripciones_materias_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Horario
CREATE TABLE `horarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cursada_id` INTEGER NOT NULL,
    `dia` VARCHAR(191) NOT NULL,
    `hora_inicio` DATETIME(3) NOT NULL,
    `hora_fin` DATETIME(3) NOT NULL,
    `aula` VARCHAR(50) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    CONSTRAINT `horarios_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Asistencia
CREATE TABLE `asistencias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cursada_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `presente` BOOLEAN NOT NULL DEFAULT true,
    `justificado` BOOLEAN NOT NULL DEFAULT false,
    `observacion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asistencias_cursada_id_alumno_id_fecha_key`(`cursada_id`, `alumno_id`, `fecha`),
    PRIMARY KEY (`id`),
    CONSTRAINT `asistencias_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `asistencias_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Calificacion
CREATE TABLE `calificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cursada_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `tipo_calificacion` VARCHAR(191) NOT NULL,
    `nota` DOUBLE NOT NULL,
    `fecha_registro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observacion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `calificaciones_cursada_id_alumno_id_tipo_calificacion_key`(`cursada_id`, `alumno_id`, `tipo_calificacion`),
    PRIMARY KEY (`id`),
    CONSTRAINT `calificaciones_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `calificaciones_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Mesa
CREATE TABLE `mesas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `tipo_examen` VARCHAR(191) NOT NULL,
    `llamado` INTEGER NOT NULL DEFAULT 1,
    `estado_mesa` VARCHAR(191) NOT NULL DEFAULT 'ABIERTA',
    `folio_examen` VARCHAR(255) NULL,
    `libro_examen` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    CONSTRAINT `mesas_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MesaTribunal
CREATE TABLE `mesas_tribunal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mesa_id` INTEGER NOT NULL,
    `profesor_id` INTEGER NOT NULL,
    `rol_tribunal` VARCHAR(191) NOT NULL DEFAULT 'VOCAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mesas_tribunal_mesa_id_profesor_id_key`(`mesa_id`, `profesor_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `mesas_tribunal_mesa_id_fkey` FOREIGN KEY (`mesa_id`) REFERENCES `mesas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `mesas_tribunal_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- InscripcionExamen
CREATE TABLE `inscripciones_examenes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mesa_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `nota_final` DOUBLE NULL,
    `condicion` VARCHAR(191) NOT NULL DEFAULT 'REGULAR',
    `aprobado` BOOLEAN NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inscripciones_examenes_mesa_id_alumno_id_key`(`mesa_id`, `alumno_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `inscripciones_examenes_mesa_id_fkey` FOREIGN KEY (`mesa_id`) REFERENCES `mesas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `inscripciones_examenes_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ProfesorMateria
CREATE TABLE `profesores_materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profesor_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,
    `fecha_asignacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `profesores_materias_profesor_id_materia_id_key`(`profesor_id`, `materia_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `profesores_materias_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `profesores_materias_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Homologacion
CREATE TABLE `homologaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,
    `tipo_homologacion` VARCHAR(191) NOT NULL,
    `calificacion` DOUBLE NOT NULL,
    `fecha_homologacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `nota_examen_homologacion` DOUBLE NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'PENDIENTE',
    `observacion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `homologaciones_alumno_id_materia_id_key`(`alumno_id`, `materia_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `homologaciones_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `homologaciones_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- LibroDeTema
CREATE TABLE `libro_de_temas` (
    `idLibroDeTema` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_id` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `temaDesarrollado` TEXT NOT NULL,
    `observaciones` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`idLibroDeTema`),
    CONSTRAINT `libro_de_temas_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;