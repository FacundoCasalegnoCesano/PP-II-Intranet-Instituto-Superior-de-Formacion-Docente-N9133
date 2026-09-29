ALTER TABLE `documentos_horarios`
  ADD COLUMN `ambito_clave` VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `carrera_id` INTEGER NULL,
  ADD COLUMN `curso_anio` INTEGER NULL,
  DROP INDEX `documentos_horarios_ciclo_lectivo_sha256_key`,
  ADD UNIQUE INDEX `documentos_horarios_ciclo_ambito_sha256_key`(`ciclo_lectivo`, `ambito_clave`, `sha256`),
  ADD INDEX `documentos_horarios_ciclo_carrera_curso_idx`(`ciclo_lectivo`, `carrera_id`, `curso_anio`),
  ADD CONSTRAINT `documentos_horarios_carrera_id_fkey`
    FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `publicaciones_horarios`
  DROP PRIMARY KEY,
  ADD COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT FIRST,
  ADD COLUMN `ambito_clave` VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `carrera_id` INTEGER NULL,
  ADD COLUMN `curso_anio` INTEGER NULL,
  ADD UNIQUE INDEX `publicaciones_horarios_ciclo_ambito_key`(`ciclo_lectivo`, `ambito_clave`),
  ADD INDEX `publicaciones_horarios_carrera_id_idx`(`carrera_id`),
  ADD PRIMARY KEY (`id`),
  ADD CONSTRAINT `publicaciones_horarios_carrera_id_fkey`
    FOREIGN KEY (`carrera_id`) REFERENCES `carreras`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
