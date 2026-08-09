import { z } from "zod";

export const createCarreraSchema = z.object({
  nombreCarrera: z.string().min(1, "nombreCarrera es requerido"),
  duracionCarrera: z
    .number()
    .int("duracionCarrera debe ser un número entero")
    .positive("duracionCarrera debe ser un número positivo"),
});

export const updateCarreraSchema = z.object({
  nombreCarrera: z
    .string({ message: "nombreCarrera debe ser un texto" })
    .min(1, "nombreCarrera no puede estar vacío")
    .optional(),
  duracionCarrera: z
    .number({ message: "duracionCarrera debe ser un número" })
    .int("duracionCarrera debe ser un número entero")
    .positive("duracionCarrera debe ser un número positivo")
    .optional(),
});

export const carreraIdParamSchema = z.object({
  id: z.coerce
    .number({ message: "id debe ser un número" })
    .int("id debe ser un número entero")
    .positive("id debe ser un número positivo"),
});

// carreraIdParamSchema lo que hace es que intenta convertir lo que sea que pases como  id a int, de esa forma si pones letras o simbolos que no son numeros da un error, asi se asegura que lo que pasas son siempre int

export type CreateCarreraInput = z.infer<typeof createCarreraSchema>;
export type UpdateCarreraInput = z.infer<typeof updateCarreraSchema>;
export type CarreraIdParam = z.infer<typeof carreraIdParamSchema>;
