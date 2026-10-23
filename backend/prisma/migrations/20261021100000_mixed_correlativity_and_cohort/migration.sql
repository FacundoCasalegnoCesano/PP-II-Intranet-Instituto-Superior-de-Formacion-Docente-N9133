ALTER TABLE `correlatividades`
  MODIFY `materia_requerida_id` INTEGER NULL,
  ADD COLUMN `espacio_requerido_id` INTEGER NULL,
  ADD INDEX `correlatividades_espacio_requerido_id_idx` (`espacio_requerido_id`),
  ADD UNIQUE INDEX `correlatividades_origen_espacio_grupo_unique` (`materia_origen_id`, `espacio_requerido_id`, `grupo`),
  DROP FOREIGN KEY `correlatividades_materia_requerida_id_fkey`,
  ADD CONSTRAINT `correlatividades_materia_destino_fkey`
    FOREIGN KEY (`materia_requerida_id`) REFERENCES `materias` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `correlatividades_espacio_requerido_id_fkey`
    FOREIGN KEY (`espacio_requerido_id`) REFERENCES `espacios_curriculares` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `correlatividades_destino_xor_check`
    CHECK ((`materia_requerida_id` IS NULL) <> (`espacio_requerido_id` IS NULL));

ALTER TABLE `inscripciones_carreras`
  MODIFY `ciclo_lectivo` INTEGER NULL;

ALTER TABLE `inscripciones_examenes`
  ADD COLUMN `inscripcion_materia_id` INTEGER NULL,
  ADD INDEX `inscripciones_examenes_inscripcion_materia_idx` (`inscripcion_materia_id`),
  ADD CONSTRAINT `inscripciones_examenes_inscripcion_materia_fkey`
    FOREIGN KEY (`inscripcion_materia_id`) REFERENCES `inscripciones_materias` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `promociones_historicas` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `inscripcion_materia_id` INTEGER NOT NULL,
  `alumno_id` INTEGER NOT NULL,
  `nota_final` DOUBLE NOT NULL,
  `fecha_acreditacion` DATE NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `promociones_historicas_inscripcion_unique` (`inscripcion_materia_id`),
  INDEX `promociones_historicas_alumno_fecha_idx` (`alumno_id`, `fecha_acreditacion`),
  CONSTRAINT `promociones_historicas_inscripcion_fkey`
    FOREIGN KEY (`inscripcion_materia_id`) REFERENCES `inscripciones_materias` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `promociones_historicas_alumno_fkey`
    FOREIGN KEY (`alumno_id`) REFERENCES `Alumno` (`idAlumno`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `promociones_historicas_created_by_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `Usuario` (`idUsuario`)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `promociones_historicas_auditoria` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `promocion_historica_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `nota_anterior` DOUBLE NULL,
  `nota_nueva` DOUBLE NOT NULL,
  `fecha_anterior` DATE NULL,
  `fecha_nueva` DATE NOT NULL,
  `motivo` TEXT NOT NULL,
  `actor_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `promociones_historicas_auditoria_version_unique` (`promocion_historica_id`, `version`),
  INDEX `promociones_historicas_auditoria_fecha_idx` (`promocion_historica_id`, `created_at`),
  CONSTRAINT `promociones_historicas_auditoria_promocion_fkey`
    FOREIGN KEY (`promocion_historica_id`) REFERENCES `promociones_historicas` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `promociones_historicas_auditoria_actor_fkey`
    FOREIGN KEY (`actor_id`) REFERENCES `Usuario` (`idUsuario`)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE `promociones_historicas`
  ADD CONSTRAINT `promociones_historicas_nota_range_check` CHECK (`nota_final` >= 0 AND `nota_final` <= 10),
  ADD CONSTRAINT `promociones_historicas_version_check` CHECK (`version` >= 1);
