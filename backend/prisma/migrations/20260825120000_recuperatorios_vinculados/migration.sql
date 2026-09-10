-- Ampliar la tabla fisica creada por la migracion inicial. El campo numero
-- formaba parte del esquema Prisma, pero no habia sido agregado por SQL.
ALTER TABLE `calificaciones`
    ADD COLUMN `numero` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `fecha_evaluacion` DATE NULL,
    ADD COLUMN `parcial_original_id` INTEGER NULL;

-- La clave anterior solo permitia una calificacion de cada tipo. Crear primero
-- la nueva clave mantiene la unicidad durante la transicion y habilita varias
-- instancias (Parcial 1, Parcial 2, etc.).
CREATE UNIQUE INDEX `calificaciones_cursada_alumno_tipo_numero_key`
    ON `calificaciones`(`cursada_id`, `alumno_id`, `tipo_calificacion`, `numero`);

DROP INDEX `calificaciones_cursada_id_alumno_id_tipo_calificacion_key`
    ON `calificaciones`;

-- Preservar parciales existentes. fecha_registro es mejor dato historico
-- disponible para registros anteriores a esta migracion.
UPDATE `calificaciones`
SET `fecha_evaluacion` = DATE(`fecha_registro`)
WHERE `tipo_calificacion` = 'PARCIAL'
  AND `fecha_evaluacion` IS NULL;

-- Preservar vinculos existentes, antes inferidos por cursada, alumno y numero.
UPDATE `calificaciones` AS recuperatorio
INNER JOIN `calificaciones` AS parcial
    ON parcial.`cursada_id` = recuperatorio.`cursada_id`
   AND parcial.`alumno_id` = recuperatorio.`alumno_id`
   AND parcial.`numero` = recuperatorio.`numero`
   AND parcial.`tipo_calificacion` = 'PARCIAL'
SET recuperatorio.`parcial_original_id` = parcial.`id`
WHERE recuperatorio.`tipo_calificacion` = 'RECUPERATORIO'
  AND recuperatorio.`parcial_original_id` IS NULL;

CREATE UNIQUE INDEX `calificaciones_parcial_original_id_key`
    ON `calificaciones`(`parcial_original_id`);

ALTER TABLE `calificaciones`
    ADD CONSTRAINT `calificaciones_parcial_original_id_fkey`
    FOREIGN KEY (`parcial_original_id`) REFERENCES `calificaciones`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
