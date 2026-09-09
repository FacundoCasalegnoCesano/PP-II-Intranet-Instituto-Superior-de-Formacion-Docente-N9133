CREATE TEMPORARY TABLE materias_nombre_preflight (
  carrera_id INTEGER NOT NULL,
  nombre_normalizado VARCHAR(255) NOT NULL,
  UNIQUE KEY materias_nombre_preflight_unique (carrera_id, nombre_normalizado)
);

INSERT INTO materias_nombre_preflight (carrera_id, nombre_normalizado)
SELECT carrera_id, TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '))
FROM materias;

DROP TEMPORARY TABLE materias_nombre_preflight;

UPDATE materias
SET nombre = TRIM(REGEXP_REPLACE(nombre, '[[:space:]]+', ' '));

CREATE UNIQUE INDEX materias_carrera_nombre_unique
  ON materias(carrera_id, nombre);
