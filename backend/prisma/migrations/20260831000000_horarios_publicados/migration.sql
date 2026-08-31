-- Migración aditiva: conserva la infraestructura histórica de `horarios`.
CREATE TABLE `documentos_horarios` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `ciclo_lectivo` INTEGER NOT NULL,
  `titulo` VARCHAR(160) NOT NULL,
  `nombre_original` VARCHAR(255) NOT NULL,
  `clave_interna` CHAR(36) NOT NULL,
  `tamanio` INTEGER NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `publicador_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `documentos_horarios_clave_interna_key`(`clave_interna`),
  UNIQUE INDEX `documentos_horarios_ciclo_lectivo_sha256_key`(`ciclo_lectivo`, `sha256`),
  INDEX `documentos_horarios_ciclo_lectivo_created_at_idx`(`ciclo_lectivo`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `documentos_horarios_publicador_id_fkey`
    FOREIGN KEY (`publicador_id`) REFERENCES `Usuario`(`idUsuario`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `publicaciones_horarios` (
  `ciclo_lectivo` INTEGER NOT NULL,
  `documento_id` INTEGER NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `publicaciones_horarios_documento_id_key`(`documento_id`),
  PRIMARY KEY (`ciclo_lectivo`),
  CONSTRAINT `publicaciones_horarios_documento_id_fkey`
    FOREIGN KEY (`documento_id`) REFERENCES `documentos_horarios`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reversión manual (ejecutar solo tras confirmar que no se necesitan las versiones):
-- DROP TABLE `publicaciones_horarios`;
-- DROP TABLE `documentos_horarios`;
