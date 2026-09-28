ALTER TABLE `Usuario`
  ADD COLUMN `login_failed_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `login_locked_until` DATETIME(3) NULL;
