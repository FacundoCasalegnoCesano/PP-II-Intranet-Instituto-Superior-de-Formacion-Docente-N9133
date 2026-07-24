import type { Request, Response } from "express";
import { carreraRepository } from "@/repositories/carrera.repository.js";

import {
  createCarreraSchema,
  updateCarreraSchema,
  carreraIdParamSchema,
} from "@/validations/carrera.validation.js";

export const carreraController = {
  getAll: async (_req: Request, res: Response) => {
    const carreras = await carreraRepository.findAll();
    res.json(carreras);
  },

  getById: async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);
    // como que que lo que estoy pasando en el req.params es el atributo id?

    const carrera = await carreraRepository.findById(id);

    if (!carrera) {
      return res.status(404).json({ message: "Carrera no encontrada" });
    }

    res.json(carrera);
  },

  create: async (req: Request, res: Response) => {
    console.log("BODY:", req.body);
    const data = createCarreraSchema.parse(req.body);
    // Entiendo que la data de abajo deberia ser correcta porque ya paso por el filtro del parse, pero que pasa si no pasa ese filtro?
    const carrera = await carreraRepository.create(data);
    res.status(201).json(carrera);
  },

  update: async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);
    const data = updateCarreraSchema.parse(req.body);
    // de vuelta, que pasa si hay errores ahi arriba?
    try {
      const carrera = await carreraRepository.update(id, data);
      res.json(carrera);
    } catch {
      res.status(404).json({ message: "Carrera no encontrada" });
    }
  },

  delete: async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);

    try {
      await carreraRepository.delete(id);
      res.status(204).send();
      // cuando se usa el .send() en el res.status?
    } catch {
      res.status(404).json({ message: "Carrera no encontrada" });
    }
  },
};
