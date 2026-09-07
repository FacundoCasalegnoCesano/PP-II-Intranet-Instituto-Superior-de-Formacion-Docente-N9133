-- Rollback manual. Ejecutar solo despues de desplegar una version de la API
-- que ya no lea fecha_evaluacion ni parcial_original_id.
ALTER TABLE `Calificacion`
    DROP FOREIGN KEY `Calificacion_parcial_original_id_fkey`;

DROP INDEX `Calificacion_parcial_original_id_key` ON `Calificacion`;

ALTER TABLE `Calificacion`
    DROP COLUMN `parcial_original_id`,
    DROP COLUMN `fecha_evaluacion`;
