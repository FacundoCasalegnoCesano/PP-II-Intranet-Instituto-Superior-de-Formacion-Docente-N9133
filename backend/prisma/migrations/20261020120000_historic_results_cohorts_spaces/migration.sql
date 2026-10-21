-- Expand the academic schema without rewriting existing academic records.
ALTER TABLE `Alumno` MODIFY `anioEgreso` INTEGER NULL;
ALTER TABLE `inscripciones_carreras` ADD COLUMN `anio_cohorte` INTEGER NULL;

ALTER TABLE `espacios_curriculares`
  DROP INDEX `espacios_curriculares_nombre_key`,
  ADD COLUMN `carrera_id` INTEGER NULL,
  ADD COLUMN `composicion_bloqueada_at` DATETIME(3) NULL,
  MODIFY COLUMN `activo` BOOLEAN NOT NULL DEFAULT false,
  ADD UNIQUE INDEX `espacios_carrera_nombre_unique` (`carrera_id`, `nombre`),
  ADD CONSTRAINT `espacios_curriculares_carrera_id_fkey` FOREIGN KEY (`carrera_id`) REFERENCES `carreras` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Infer a legacy space's career only when all attached subjects agree.
UPDATE `espacios_curriculares` AS e
SET e.`carrera_id` = (
  SELECT MIN(m.`carrera_id`)
  FROM `materias` AS m
  WHERE m.`espacio_curricular_id` = e.`id`
  HAVING COUNT(DISTINCT m.`carrera_id`) = 1
)
WHERE e.`carrera_id` IS NULL;

ALTER TABLE `correlatividades`
  ADD COLUMN `suspendida_por_espacio` BOOLEAN NOT NULL DEFAULT false;
UPDATE `correlatividades` AS co
JOIN `materias` AS m ON m.`id` = co.`materia_origen_id`
SET co.`suspendida_por_espacio` = true
WHERE m.`espacio_curricular_id` IS NOT NULL;

CREATE TABLE `espacios_correlatividades` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `espacio_origen_id` INTEGER NOT NULL,
  `materia_requerida_id` INTEGER NULL,
  `espacio_requerido_id` INTEGER NULL,
  `aplica_cursado` BOOLEAN NOT NULL DEFAULT true,
  `aplica_rendir` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `espacios_correlatividades_espacio_origen_id_idx` (`espacio_origen_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `espacios_correlatividades_origen_fkey` FOREIGN KEY (`espacio_origen_id`) REFERENCES `espacios_curriculares` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `espacios_correlatividades_materia_fkey` FOREIGN KEY (`materia_requerida_id`) REFERENCES `materias` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `espacios_correlatividades_espacio_fkey` FOREIGN KEY (`espacio_requerido_id`) REFERENCES `espacios_curriculares` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mesas`
  MODIFY COLUMN `tipo_examen` ENUM('ORAL', 'ESCRITO') NULL,
  MODIFY COLUMN `fecha` DATETIME(3) NULL,
  MODIFY COLUMN `llamado` INTEGER NULL DEFAULT 1,
  ADD COLUMN `origen` ENUM('ORDINARIA', 'HISTORICA') NOT NULL DEFAULT 'ORDINARIA',
  ADD COLUMN `ciclo_lectivo` INTEGER NOT NULL DEFAULT 2026,
  ADD COLUMN `fecha_civil` DATE NULL;
UPDATE `mesas` SET `ciclo_lectivo` = YEAR(`fecha`);

ALTER TABLE `inscripciones_examenes`
  MODIFY COLUMN `condicion` ENUM('REGULAR', 'LIBRE') NULL DEFAULT 'REGULAR',
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `historico_materia_id` INTEGER NULL,
  ADD COLUMN `historico_ciclo_lectivo` INTEGER NULL,
  ADD COLUMN `historico_fecha_civil` DATE NULL,
  ADD UNIQUE INDEX `inscripcion_examen_historico_dedupe` (`alumno_id`, `historico_materia_id`, `historico_ciclo_lectivo`, `historico_fecha_civil`);

-- Existing fully completed groups are locked when every component has an
-- approved final or homologation for the same student.
UPDATE `espacios_curriculares` AS e
JOIN (
  SELECT e2.`id` AS `espacio_id`
  FROM `espacios_curriculares` AS e2
  JOIN `materias` AS m ON m.`espacio_curricular_id` = e2.`id`
  CROSS JOIN `Alumno` AS a
  LEFT JOIN (
    SELECT ie.`alumno_id`, mesa.`materia_id`
    FROM `inscripciones_examenes` AS ie
    JOIN `mesas` AS mesa ON mesa.`id` = ie.`mesa_id`
    WHERE ie.`aprobado` = true AND ie.`nota_final` IS NOT NULL AND ie.`fecha_baja` IS NULL
    UNION
    SELECT h.`alumno_id`, h.`materia_id`
    FROM `homologaciones` AS h
    WHERE h.`estado` = 'APROBADA' AND h.`calificacion` IS NOT NULL
  ) AS passed ON passed.`alumno_id` = a.`idAlumno` AND passed.`materia_id` = m.`id`
  WHERE e2.`activo` = true
  GROUP BY e2.`id`, a.`idAlumno`
  HAVING COUNT(DISTINCT m.`id`) >= 2
    AND COUNT(DISTINCT CASE WHEN passed.`materia_id` IS NOT NULL THEN m.`id` END) = COUNT(DISTINCT m.`id`)
) AS completed ON completed.`espacio_id` = e.`id`
SET e.`composicion_bloqueada_at` = CURRENT_TIMESTAMP(3)
WHERE e.`composicion_bloqueada_at` IS NULL;
