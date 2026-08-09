import { mysqlTable, int, varchar, unique } from "drizzle-orm/mysql-core";

export const carrera = mysqlTable(
  "carrera",
  {
    idCarrera: int("idCarrera").autoincrement().primaryKey(),
    nombreCarrera: varchar("nombreCarrera", { length: 255 }).notNull(),
    duracionCarrera: int("duracionCarrera").notNull(),
  },
  (table) => ({
    nombreUnico: unique("uq_nombre_carrera").on(table.nombreCarrera),
  }),
);
