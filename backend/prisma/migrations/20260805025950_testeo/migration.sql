-- ============================================
-- MIGRACIÓN 2: Tabla de sesiones
-- ============================================

CREATE TABLE `sesiones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(500) NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expira_en` DATETIME(3) NOT NULL,
    `cerrada_en` DATETIME(3) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    UNIQUE INDEX `sesiones_token_key`(`token`),
    UNIQUE INDEX `sesiones_usuario_id_token_key`(`usuario_id`, `token`),
    PRIMARY KEY (`id`),
    CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`idUsuario`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;