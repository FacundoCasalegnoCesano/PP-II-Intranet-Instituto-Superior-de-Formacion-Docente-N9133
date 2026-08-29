CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_usuario_id_idx`(`usuario_id`),
    INDEX `password_reset_tokens_expires_at_idx`(`expires_at`),
    INDEX `password_reset_tokens_usuario_id_used_at_idx`(`usuario_id`, `used_at`),
    CONSTRAINT `password_reset_tokens_usuario_id_fkey`
      FOREIGN KEY (`usuario_id`) REFERENCES `Usuario`(`idUsuario`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
