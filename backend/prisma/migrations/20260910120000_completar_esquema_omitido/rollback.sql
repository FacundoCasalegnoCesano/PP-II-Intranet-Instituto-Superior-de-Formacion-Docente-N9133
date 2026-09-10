-- Rollback manual y destructivo para datos de seleccion de periodos.
-- Respaldar las tablas periodos_materias y periodos_mesas antes de ejecutarlo,
-- y desplegar primero una API que ya no dependa de estas columnas o tablas.
DROP TABLE `periodos_mesas`;
DROP TABLE `periodos_materias`;

ALTER TABLE `periodos_inscripcion`
    DROP COLUMN `ciclo_lectivo`;

ALTER TABLE `Usuario`
    DROP COLUMN `backupCodes`;

DROP INDEX `sesiones_familia_id_idx` ON `sesiones`;

ALTER TABLE `sesiones`
    DROP COLUMN `revocada_en`,
    DROP COLUMN `familia_id`,
    DROP COLUMN `refresh_token_expira`,
    DROP COLUMN `refresh_token_hash`;
