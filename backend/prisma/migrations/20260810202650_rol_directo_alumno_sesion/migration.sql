-- ============================================
-- MIGRACIÓN 3: Tabla de periodos de inscripción
-- ============================================

CREATE TABLE `periodos_inscripcion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(191) NOT NULL,
    `fecha_inicio` DATETIME(3) NOT NULL,
    `fecha_fin` DATETIME(3) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;