-- Expandir Calificacion con fecha real de evaluacion y vinculo explicito
-- entre recuperatorio y parcial original.
ALTER TABLE `Calificacion`
    ADD COLUMN `fecha_evaluacion` DATE NULL,
    ADD COLUMN `parcial_original_id` INTEGER NULL;

-- Preservar parciales existentes. fecha_registro es mejor dato historico
-- disponible para registros anteriores a esta migracion.
UPDATE `Calificacion`
SET `fecha_evaluacion` = DATE(`fecha_registro`)
WHERE `tipo_calificacion` = 'PARCIAL'
  AND `fecha_evaluacion` IS NULL;

-- Preservar vinculos existentes, antes inferidos por cursada, alumno y numero.
UPDATE `Calificacion` AS recuperatorio
INNER JOIN `Calificacion` AS parcial
    ON parcial.`cursada_id` = recuperatorio.`cursada_id`
   AND parcial.`alumno_id` = recuperatorio.`alumno_id`
   AND parcial.`numero` = recuperatorio.`numero`
   AND parcial.`tipo_calificacion` = 'PARCIAL'
SET recuperatorio.`parcial_original_id` = parcial.`id`
WHERE recuperatorio.`tipo_calificacion` = 'RECUPERATORIO'
  AND recuperatorio.`parcial_original_id` IS NULL;

CREATE UNIQUE INDEX `Calificacion_parcial_original_id_key`
    ON `Calificacion`(`parcial_original_id`);

ALTER TABLE `Calificacion`
    ADD CONSTRAINT `Calificacion_parcial_original_id_fkey`
    FOREIGN KEY (`parcial_original_id`) REFERENCES `Calificacion`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
