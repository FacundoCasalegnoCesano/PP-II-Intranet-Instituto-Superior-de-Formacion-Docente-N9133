/*
  Warnings:

  - You are about to drop the `alumno` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `alumno`;

-- CreateTable
CREATE TABLE `sesiones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(500) NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expira_en` DATETIME(3) NOT NULL,
    `cerrada_en` DATETIME(3) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    UNIQUE INDEX `sesiones_token_key`(`token`),
    UNIQUE INDEX `sesiones_usuario_id_token_key`(`usuario_id`, `token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apellido_nombre` VARCHAR(255) NOT NULL,
    `dni` VARCHAR(8) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `fecha_nacimiento` DATETIME(3) NOT NULL,
    `telefono` VARCHAR(11) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `cuil` VARCHAR(11) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `contacto_emergencia` VARCHAR(255) NULL,
    `foto` VARCHAR(255) NULL,
    `ultimo_acceso` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_dni_key`(`dni`),
    UNIQUE INDEX `usuarios_email_key`(`email`),
    UNIQUE INDEX `usuarios_cuil_key`(`cuil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `rol` ENUM('ALUMNO', 'ADMINISTRATIVO', 'PROFESOR') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_roles_usuario_id_rol_key`(`usuario_id`, `rol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NOT NULL,
    `descripcion` TEXT NULL,
    `codigo` VARCHAR(50) NULL,
    `carga_horaria` INTEGER NOT NULL,
    `horas_catedra` VARCHAR(50) NULL,
    `tipo_espacio` ENUM('MATERIA', 'SEMINARIO', 'TALLER', 'TALLER_PRACTICA') NOT NULL DEFAULT 'MATERIA',
    `modalidad` ENUM('PRESENCIAL', 'SEMIPRESENCIAL', 'LIBRE') NULL DEFAULT 'PRESENCIAL',
    `periodo` ENUM('ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE') NULL DEFAULT 'ANUAL',
    `regimen` ENUM('REGULAR_PRESENCIAL_PROMOCION', 'REGULAR_PRESENCIAL_SIN_PROMOCION', 'REGULAR_SEMIPRESENCIAL', 'LIBRE') NULL DEFAULT 'REGULAR_PRESENCIAL_SIN_PROMOCION',
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

    UNIQUE INDEX `materias_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE `alumnos_cursos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `curso_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `alumnos_cursos_alumno_id_curso_id_key`(`alumno_id`, `curso_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alumnos_espacios_curriculares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `espacio_curricular_id` INTEGER NOT NULL,
    `promedio` DOUBLE NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `alumnos_espacios_curriculares_alumno_id_espacio_curricular_i_key`(`alumno_id`, `espacio_curricular_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `correlatividades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_origen_id` INTEGER NOT NULL,
    `materia_requerida_id` INTEGER NOT NULL,
    `tipoRequisito` ENUM('OBLIGATORIA', 'ALTERNATIVA', 'GRUPO') NOT NULL DEFAULT 'OBLIGATORIA',
    `grupo` VARCHAR(100) NULL,
    `cantidad_minima_aprobadas` INTEGER NULL,
    `aplica_cursado` BOOLEAN NOT NULL DEFAULT true,
    `aplica_rendir` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `correlatividades_materia_origen_id_materia_requerida_id_grup_key`(`materia_origen_id`, `materia_requerida_id`, `grupo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `planes_estudio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carrera_id` INTEGER NOT NULL,
    `anio` INTEGER NOT NULL,
    `descripcion` TEXT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `planes_estudio_carrera_id_anio_key`(`carrera_id`, `anio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscripciones_carreras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `carrera_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `ciclo_lectivo` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inscripciones_carreras_alumno_id_carrera_id_key`(`alumno_id`, `carrera_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscripciones_materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `ciclo_lectivo` INTEGER NOT NULL,
    `modalidad_elegida` ENUM('PRESENCIAL', 'SEMIPRESENCIAL', 'LIBRE') NOT NULL DEFAULT 'PRESENCIAL',
    `estado` ENUM('ACTIVA', 'BAJA', 'FINALIZADA', 'RECURSANDO') NOT NULL DEFAULT 'ACTIVA',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `cursada_id` INTEGER NULL,

    UNIQUE INDEX `inscripciones_materias_alumno_id_materia_id_ciclo_lectivo_key`(`alumno_id`, `materia_id`, `ciclo_lectivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cursadas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_id` INTEGER NOT NULL,
    `anio_lectivo` INTEGER NOT NULL,
    `periodo` ENUM('ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE') NOT NULL DEFAULT 'ANUAL',
    `docente_id` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cursadas_materia_id_anio_lectivo_periodo_key`(`materia_id`, `anio_lectivo`, `periodo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cursada_id` INTEGER NOT NULL,
    `dia` ENUM('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO') NOT NULL,
    `hora_inicio` DATETIME(3) NOT NULL,
    `hora_fin` DATETIME(3) NOT NULL,
    `aula` VARCHAR(50) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cursada_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `tipo_calificacion` ENUM('PARCIAL', 'RECUPERATORIO', 'COLOQUIO', 'EXAMEN_FINAL', 'TRABAJO_PRACTICO', 'PROMOCION') NOT NULL,
    `nota` DOUBLE NOT NULL,
    `fecha_registro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observacion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `calificaciones_cursada_id_alumno_id_tipo_calificacion_key`(`cursada_id`, `alumno_id`, `tipo_calificacion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `examenes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `materia_id` INTEGER NOT NULL,
    `fecha` DATETIME(3) NOT NULL,
    `tipo_examen` ENUM('ORAL', 'ESCRITO') NOT NULL,
    `llamado` INTEGER NOT NULL DEFAULT 1,
    `folio` VARCHAR(255) NULL,
    `libro` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tribunales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examen_id` INTEGER NOT NULL,
    `profesor_id` INTEGER NOT NULL,
    `rol_tribunal` ENUM('PRESIDENTE', 'VOCAL', 'SUPLENTE') NOT NULL DEFAULT 'VOCAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tribunales_examen_id_profesor_id_key`(`examen_id`, `profesor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inscripciones_examenes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `examen_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fecha_baja` DATETIME(3) NULL,
    `nota_final` DOUBLE NULL,
    `condicion` ENUM('REGULAR', 'LIBRE') NOT NULL DEFAULT 'REGULAR',
    `aprobado` BOOLEAN NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inscripciones_examenes_examen_id_alumno_id_key`(`examen_id`, `alumno_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `homologaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alumno_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,
    `tipo_homologacion` ENUM('TOTAL', 'PARCIAL') NOT NULL,
    `calificacion` DOUBLE NOT NULL,
    `fecha_homologacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `nota_examen_homologacion` DOUBLE NULL,
    `estado` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `observacion` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `homologaciones_alumno_id_materia_id_key`(`alumno_id`, `materia_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `periodos_inscripcion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('MATERIA', 'EXAMEN') NOT NULL,
    `fecha_inicio` DATETIME(3) NOT NULL,
    `fecha_fin` DATETIME(3) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sesiones` ADD CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_roles` ADD CONSTRAINT `usuarios_roles_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materias` ADD CONSTRAINT `materias_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materias` ADD CONSTRAINT `materias_curso_id_fkey` FOREIGN KEY (`curso_id`) REFERENCES `cursos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materias` ADD CONSTRAINT `materias_espacio_curricular_id_fkey` FOREIGN KEY (`espacio_curricular_id`) REFERENCES `espacios_curriculares`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materias` ADD CONSTRAINT `materias_plan_estudio_id_fkey` FOREIGN KEY (`plan_estudio_id`) REFERENCES `planes_estudio`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alumnos_cursos` ADD CONSTRAINT `alumnos_cursos_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alumnos_cursos` ADD CONSTRAINT `alumnos_cursos_curso_id_fkey` FOREIGN KEY (`curso_id`) REFERENCES `cursos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alumnos_espacios_curriculares` ADD CONSTRAINT `alumnos_espacios_curriculares_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alumnos_espacios_curriculares` ADD CONSTRAINT `alumnos_espacios_curriculares_espacio_curricular_id_fkey` FOREIGN KEY (`espacio_curricular_id`) REFERENCES `espacios_curriculares`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `correlatividades` ADD CONSTRAINT `correlatividades_materia_origen_id_fkey` FOREIGN KEY (`materia_origen_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `correlatividades` ADD CONSTRAINT `correlatividades_materia_requerida_id_fkey` FOREIGN KEY (`materia_requerida_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `planes_estudio` ADD CONSTRAINT `planes_estudio_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_carreras` ADD CONSTRAINT `inscripciones_carreras_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_carreras` ADD CONSTRAINT `inscripciones_carreras_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_materias` ADD CONSTRAINT `inscripciones_materias_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_materias` ADD CONSTRAINT `inscripciones_materias_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_materias` ADD CONSTRAINT `inscripciones_materias_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cursadas` ADD CONSTRAINT `cursadas_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cursadas` ADD CONSTRAINT `cursadas_docente_id_fkey` FOREIGN KEY (`docente_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horarios` ADD CONSTRAINT `horarios_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asistencias` ADD CONSTRAINT `asistencias_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calificaciones` ADD CONSTRAINT `calificaciones_cursada_id_fkey` FOREIGN KEY (`cursada_id`) REFERENCES `cursadas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calificaciones` ADD CONSTRAINT `calificaciones_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `examenes` ADD CONSTRAINT `examenes_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tribunales` ADD CONSTRAINT `tribunales_examen_id_fkey` FOREIGN KEY (`examen_id`) REFERENCES `examenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tribunales` ADD CONSTRAINT `tribunales_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_examenes` ADD CONSTRAINT `inscripciones_examenes_examen_id_fkey` FOREIGN KEY (`examen_id`) REFERENCES `examenes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inscripciones_examenes` ADD CONSTRAINT `inscripciones_examenes_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesores_materias` ADD CONSTRAINT `profesores_materias_profesor_id_fkey` FOREIGN KEY (`profesor_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `profesores_materias` ADD CONSTRAINT `profesores_materias_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `homologaciones` ADD CONSTRAINT `homologaciones_alumno_id_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `homologaciones` ADD CONSTRAINT `homologaciones_materia_id_fkey` FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
