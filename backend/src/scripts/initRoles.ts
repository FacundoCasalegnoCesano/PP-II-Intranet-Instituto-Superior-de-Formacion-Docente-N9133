// Los roles viven como ENUM en el schema (campo `rol` de UsuarioRol),
// no como filas de una tabla Rol. Por eso no hay nada que seedear:
// los valores posibles son ALUMNO, PROFESOR y ADMINISTRATIVO.
console.log('ℹ️  Los roles son un enum de Prisma (ALUMNO, PROFESOR, ADMINISTRATIVO). No requiere inicialización.');
console.log('✅ Roles OK — usa npm run create:admin para crear el administrador inicial.');