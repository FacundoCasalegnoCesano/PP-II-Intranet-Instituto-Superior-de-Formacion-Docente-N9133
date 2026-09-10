-- Rollback manual. Ejecutar solo despues de desplegar una version de la API
-- que ya no lea numero, fecha_evaluacion ni parcial_original_id.
ALTER TABLE `calificaciones`
    DROP FOREIGN KEY `calificaciones_parcial_original_id_fkey`;

DROP INDEX `calificaciones_parcial_original_id_key` ON `calificaciones`;

-- Abortara sin borrar datos si ya existen varias instancias del mismo tipo y,
-- por lo tanto, no es posible restaurar la clave unica anterior.
CREATE TEMPORARY TABLE `calificaciones_rollback_preflight` (
    `cursada_id` INTEGER NOT NULL,
    `alumno_id` INTEGER NOT NULL,
    `tipo_calificacion` VARCHAR(191) NOT NULL,
    UNIQUE INDEX `calificaciones_rollback_preflight_key`
        (`cursada_id`, `alumno_id`, `tipo_calificacion`)
);

INSERT INTO `calificaciones_rollback_preflight`
    (`cursada_id`, `alumno_id`, `tipo_calificacion`)
SELECT `cursada_id`, `alumno_id`, `tipo_calificacion`
FROM `calificaciones`;

DROP TEMPORARY TABLE `calificaciones_rollback_preflight`;

CREATE UNIQUE INDEX `calificaciones_cursada_id_alumno_id_tipo_calificacion_key`
    ON `calificaciones`(`cursada_id`, `alumno_id`, `tipo_calificacion`);

DROP INDEX `calificaciones_cursada_alumno_tipo_numero_key`
    ON `calificaciones`;

ALTER TABLE `calificaciones`
    DROP COLUMN `parcial_original_id`,
    DROP COLUMN `fecha_evaluacion`,
    DROP COLUMN `numero`;
