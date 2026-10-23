# Operación institucional

## Migración y purga de sesiones

`Sesion.token` guarda la huella SHA-256 lowercase del access token y `refreshTokenHash` conserva la huella del refresh. Para migrar sesiones anteriores, detener todas las instancias de la API, confirmar el backup operativo y ejecutar desde `backend/`:

```sh
npm run build
npm run sessions:migrate-hashes
npm run sessions:migrate-hashes -- --apply
npm run sessions:migrate-hashes
```

El comando es de simulación por defecto. `--apply` convierte JWT heredados por lotes; los digests ya migrados se omiten y valores desconocidos hacen abortar la corrida antes de modificar filas. Revisar sólo los conteos e IDs de filas informados, nunca copiar tokens o digests a logs. Levantar la API nueva únicamente luego de confirmar que la última simulación informa cero valores legacy y desconocidos. Si la conversión falla, mantener detenida la API y repetir tras corregir la causa. Tras aceptar tráfico nuevo, un rollback a código incompatible requiere invalidar las sesiones con un procedimiento controlado y exigir nuevo login; no restaurar sesiones desde un snapshot antiguo.

La purga CLI también simula por defecto. `npm run sessions:purge` cuenta sesiones cuyo access y refresh ya vencieron; `npm run sessions:purge -- --apply` elimina esas filas en lotes de hasta 500. Las sesiones con refresh vigente se conservan aunque el access haya vencido, incluidas las revocadas que sirven para detectar replay.

La ejecución automática sigue pendiente de identificar y validar el scheduler del host. Objetivo acordado: una vez al día a las 03:00 de `America/Argentina/Buenos_Aires`. Antes de activarla, asignar responsable operativo, confirmar zona horaria y permisos de acceso a la configuración de base, configurar registro y alertas del resultado, y ensayar en preproducción. No hay scheduler conectado a la API ni purga automática activa.

## Conexiones y picos de uso

La aplicación requiere Node.js 22.x (verificado con 22.23.3) y conecta Prisma con MariaDB mediante `DATABASE_URL`. La concurrencia de personas no equivale a conexiones: cada instancia de la API mantiene su propio pool. Antes de aumentar instancias o el pool, medir conexiones abiertas y en espera, consultas lentas, CPU, memoria y el límite configurado en MariaDB. Dimensionar la suma de los pools de todas las instancias por debajo del límite medido, reservando conexiones para administración y otras aplicaciones. No fijar un pool por el número de usuarios ni asumir capacidad sin una prueba representativa.

Prisma 5 usa por defecto un pool de `num_cpus * 2 + 1` conexiones y permite ajustar `connection_limit` en `DATABASE_URL`. Si se configuran varias instancias, repartir el presupuesto entre ellas y volver a medir antes de desplegar el cambio. Consultar la [documentación de conexiones de Prisma](https://www.prisma.io/docs/orm/v6/overview/databases/mysql) para el parámetro y el [tamaño recomendado por instancia](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections).

El uso esperado informado es de unas 50 personas simultáneas y picos de 150 o algo más durante exámenes. El ensayo actual ejecutó 200 solicitudes HTTP simultáneas con la base simulada; sirve como referencia aislada del flujo HTTP, no como prueba de capacidad de MariaDB. Registrar duración, concurrencia, consultas y recursos de una prueba representativa con base real aislada antes de decidir el dimensionamiento institucional.

## Copias y restauración

La institución debe definir responsable, frecuencia, cifrado, ubicación separada, acceso y retención de las copias. Conservar el historial según esa política; no configurar purgas automáticas sin una decisión institucional. La existencia de copias locales de desarrollo no confirma que producción tenga copias.

Para MariaDB, generar una copia lógica de la base con una herramienta compatible con la versión instalada y guardar el resultado en almacenamiento protegido:

```sh
mariadb-dump --single-transaction --routines --events --triggers --databases instituto_db > instituto_db.sql
```

`--single-transaction` permite una lectura consistente cuando todas las tablas son transaccionales, pero no protege tablas MyISAM y requiere evitar cambios de esquema durante la copia. Revisar las opciones y compatibilidad de la instalación en la [documentación de mariadb-dump](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump). Proteger el archivo y el destino según la política institucional. Hacer la restauración primero en una base aislada y vacía, con una versión compatible, y revisar integridad funcional antes de declarar recuperable una copia:

```sh
mariadb --host=127.0.0.1 --user=usuario --password instituto_db < instituto_db.sql
```

La contraseña se solicita de forma interactiva. Ajustar nombre, destino y permisos a la instalación; nunca probar una restauración sobre la base de producción. Incluir por separado los archivos privados de horarios publicados en el plan de respaldo y verificar que coincidan con la copia de base.

## Cambios de esquema

Desplegar migraciones existentes con `npm run prisma:deploy` desde `backend` y con `DATABASE_URL` de la instancia prevista. Revisar primero la migración y verificar una restauración en entorno aislado. No usar `prisma migrate reset` en producción: ese comando elimina datos.


Para inicializar el latch de espacios con aprobaciones históricas por promoción, mantener la aplicación fuera de tráfico después de `prisma:deploy`, revisar el resultado de `npm run spaces:backfill-latches -- --dry-run` y luego ejecutar `npm run spaces:backfill-latches -- --apply` con la misma `DATABASE_URL`. Este backfill usa el evaluador académico canónico, sólo actualiza espacios activos de dos o más componentes que siguen sin latch y se puede repetir. Habilitar el tráfico de la aplicación cuando ambos comandos terminen correctamente.
