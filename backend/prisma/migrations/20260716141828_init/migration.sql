-- CreateTable
CREATE TABLE `Carrera` (
    `idCarrera` INTEGER NOT NULL AUTO_INCREMENT,
    `nombreCarrera` VARCHAR(191) NOT NULL,
    `duracionCarrera` INTEGER NOT NULL,

    PRIMARY KEY (`idCarrera`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
