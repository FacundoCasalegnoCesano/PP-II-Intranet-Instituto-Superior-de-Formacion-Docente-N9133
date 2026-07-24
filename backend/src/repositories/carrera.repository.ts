import { prisma, Prisma } from "@/config/prisma.js";

export const carreraRepository = {
  findAll: () => prisma.carrera.findMany(),

  findById: (id: number) =>
    prisma.carrera.findUnique({
      where: { idCarrera: id },
    }),

  create: (data: Prisma.CarreraCreateInput) =>
    prisma.carrera.create({
      data,
    }),

  update: (id: number, data: Prisma.CarreraUpdateInput) =>
    prisma.carrera.update({
      where: { idCarrera: id },
      data,
    }),

  delete: (id: number) =>
    prisma.carrera.delete({
      where: { idCarrera: id },
    }),
};
