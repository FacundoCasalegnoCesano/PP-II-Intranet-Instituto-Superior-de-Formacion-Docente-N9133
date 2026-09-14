-- Etapa 7: separa la carga de resultados del último resultado publicado.
-- Todas las columnas son aditivas; los históricos conservan su nota/aprobación
-- y una nota nula no se reclasifica como ausencia.
ALTER TABLE `mesas`
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `publicada_en` DATETIME(3) NULL,
    ADD COLUMN `reabierta_en` DATETIME(3) NULL,
    ADD COLUMN `reabierta_por` INTEGER NULL,
    ADD COLUMN `motivo_reapertura` TEXT NULL;

ALTER TABLE `inscripciones_examenes`
    ADD COLUMN `nota_borrador` DOUBLE NULL,
    ADD COLUMN `ausente_borrador` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ausente_publicado` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `mesas_resultados_auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mesa_id` INTEGER NOT NULL,
    `inscripcion_id` INTEGER NULL,
    `actor_id` INTEGER NOT NULL,
    `accion` ENUM('CIERRE', 'REAPERTURA', 'CORRECCION') NOT NULL,
    `motivo` TEXT NULL,
    `nota_anterior` DOUBLE NULL,
    `nota_nueva` DOUBLE NULL,
    `ausente_anterior` BOOLEAN NULL,
    `ausente_nuevo` BOOLEAN NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mesas_resultados_auditoria_mesa_id_created_at_idx` (`mesa_id`, `created_at`),
    INDEX `mesas_resultados_auditoria_inscripcion_id_idx` (`inscripcion_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `mesas_resultados_auditoria_mesa_id_fkey`
        FOREIGN KEY (`mesa_id`) REFERENCES `mesas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `mesas_resultados_auditoria_inscripcion_id_fkey`
        FOREIGN KEY (`inscripcion_id`) REFERENCES `inscripciones_examenes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `mesas_resultados_auditoria_actor_id_fkey`
        FOREIGN KEY (`actor_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
