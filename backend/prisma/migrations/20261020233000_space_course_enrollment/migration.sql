CREATE TABLE `cursadas_espacios` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `espacio_curricular_id` INTEGER NOT NULL,
  `anio_lectivo` INTEGER NOT NULL,
  `periodo` ENUM('ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE') NOT NULL DEFAULT 'ANUAL',
  `activo` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `cursadas_espacios_anio_activo_idx` (`anio_lectivo`, `activo`),
  UNIQUE INDEX `cursadas_espacios_espacio_anio_periodo_unique` (`espacio_curricular_id`, `anio_lectivo`, `periodo`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cursadas_espacios_espacio_fkey` FOREIGN KEY (`espacio_curricular_id`) REFERENCES `espacios_curriculares`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cursadas`
  ADD COLUMN `cursada_espacio_id` INTEGER NULL,
  ADD INDEX `cursadas_espacio_idx` (`cursada_espacio_id`),
  ADD UNIQUE INDEX `cursadas_espacio_materia_unique` (`cursada_espacio_id`, `materia_id`),
  ADD CONSTRAINT `cursadas_espacio_fkey` FOREIGN KEY (`cursada_espacio_id`) REFERENCES `cursadas_espacios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `inscripciones_espacios` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `alumno_id` INTEGER NOT NULL,
  `cursada_espacio_id` INTEGER NOT NULL,
  `fecha_inscripcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `fecha_baja` DATETIME(3) NULL,
  `estado` ENUM('ACTIVA', 'BAJA', 'FINALIZADA', 'RECURSANDO') NOT NULL DEFAULT 'ACTIVA',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `inscripciones_espacios_alumno_oferta_unique` (`alumno_id`, `cursada_espacio_id`),
  INDEX `inscripciones_espacios_oferta_estado_idx` (`cursada_espacio_id`, `estado`),
  PRIMARY KEY (`id`),
  CONSTRAINT `inscripciones_espacios_alumno_fkey` FOREIGN KEY (`alumno_id`) REFERENCES `Alumno`(`idAlumno`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `inscripciones_espacios_oferta_fkey` FOREIGN KEY (`cursada_espacio_id`) REFERENCES `cursadas_espacios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inscripciones_materias`
  ADD COLUMN `inscripcion_espacio_id` INTEGER NULL,
  ADD UNIQUE INDEX `inscripciones_materias_espacio_materia_unique` (`inscripcion_espacio_id`, `materia_id`),
  ADD INDEX `inscripciones_materias_espacio_idx` (`inscripcion_espacio_id`),
  ADD CONSTRAINT `inscripciones_materias_espacio_fkey` FOREIGN KEY (`inscripcion_espacio_id`) REFERENCES `inscripciones_espacios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `periodos_espacios` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `periodo_inscripcion_id` INTEGER NOT NULL,
  `cursada_espacio_id` INTEGER NOT NULL,
  UNIQUE INDEX `periodos_espacios_periodo_oferta_unique` (`periodo_inscripcion_id`, `cursada_espacio_id`),
  INDEX `periodos_espacios_oferta_idx` (`cursada_espacio_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `periodos_espacios_periodo_fkey` FOREIGN KEY (`periodo_inscripcion_id`) REFERENCES `periodos_inscripcion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `periodos_espacios_oferta_fkey` FOREIGN KEY (`cursada_espacio_id`) REFERENCES `cursadas_espacios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
