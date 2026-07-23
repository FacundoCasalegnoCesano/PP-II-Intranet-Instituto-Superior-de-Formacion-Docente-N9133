import { prisma } from "@/config/prisma.js";

type UpdateCarreraInput = {
  nombreCarrera?: string | undefined;
  duracionCarrera?: number | undefined;
};

type CreateCarreraInput = {
  nombreCarrera: string;
  duracionCarrera: number;
};

function stripUndefined<T extends object>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const carreraRepository = {
  findAll: () => prisma.carrera.findMany(),

  findById: (id: number) =>
    prisma.carrera.findUnique({
      where: { idCarrera: id },
    }),

  create: (data: CreateCarreraInput) =>
    prisma.carrera.create({
      data,
    }),

  update: (id: number, data: UpdateCarreraInput) =>
    prisma.carrera.update({
      where: { idCarrera: id },
      data: stripUndefined(data),
    }),

  delete: (id: number) =>
    prisma.carrera.delete({
      where: { idCarrera: id },
    }),
};
