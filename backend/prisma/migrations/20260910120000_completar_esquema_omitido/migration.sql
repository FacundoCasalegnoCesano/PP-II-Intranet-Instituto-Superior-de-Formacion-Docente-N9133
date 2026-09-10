-- Completar cambios de esquema incorporados por la aplicacion antes de contar
-- con una migracion SQL equivalente. Las columnas obligatorias se expanden
-- primero como NULL, se preservan los registros existentes y luego se contraen.

ALTER TABLE `sesiones`
    ADD COLUMN `refresh_token_hash` VARCHAR(255) NULL,
    ADD COLUMN `refresh_token_expira` DATETIME(3) NULL,
    ADD COLUMN `familia_id` VARCHAR(36) NULL,
    ADD COLUMN `revocada_en` DATETIME(3) NULL;

UPDATE `sesiones`
SET `familia_id` = UUID()
WHERE `familia_id` IS NULL;

ALTER TABLE `sesiones`
    MODIFY COLUMN `familia_id` VARCHAR(36) NOT NULL;

CREATE INDEX `sesiones_familia_id_idx` ON `sesiones`(`familia_id`);

ALTER TABLE `Usuario`
    ADD COLUMN `backupCodes` TEXT NULL;

ALTER TABLE `periodos_inscripcion`
    ADD COLUMN `ciclo_lectivo` INTEGER NULL;

UPDATE `periodos_inscripcion`
SET `ciclo_lectivo` = YEAR(`fecha_inicio`)
WHERE `ciclo_lectivo` IS NULL;

ALTER TABLE `periodos_inscripcion`
    MODIFY COLUMN `ciclo_lectivo` INTEGER NOT NULL;

CREATE TABLE `periodos_materias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodo_inscripcion_id` INTEGER NOT NULL,
    `materia_id` INTEGER NOT NULL,

    UNIQUE INDEX `periodos_materias_periodo_inscripcion_id_materia_id_key`
        (`periodo_inscripcion_id`, `materia_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `periodos_materias_periodo_inscripcion_id_fkey`
        FOREIGN KEY (`periodo_inscripcion_id`) REFERENCES `periodos_inscripcion`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `periodos_materias_materia_id_fkey`
        FOREIGN KEY (`materia_id`) REFERENCES `materias`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `periodos_mesas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodo_inscripcion_id` INTEGER NOT NULL,
    `mesa_id` INTEGER NOT NULL,

    UNIQUE INDEX `periodos_mesas_periodo_inscripcion_id_mesa_id_key`
        (`periodo_inscripcion_id`, `mesa_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `periodos_mesas_periodo_inscripcion_id_fkey`
        FOREIGN KEY (`periodo_inscripcion_id`) REFERENCES `periodos_inscripcion`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `periodos_mesas_mesa_id_fkey`
        FOREIGN KEY (`mesa_id`) REFERENCES `mesas`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
