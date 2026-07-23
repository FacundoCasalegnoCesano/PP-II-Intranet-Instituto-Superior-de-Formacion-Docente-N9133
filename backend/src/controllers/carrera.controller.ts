import type { Request, Response } from "express";
import { carreraRepository } from "../../repositories/carrera.repository.js";

export const carreraController = {
  getAll: async (_req: Request, res: Response) => {
    const carreras = await carreraRepository.findAll();
    res.json(carreras);
  },

  getById: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Id inválido" });
    }

    const carrera = await carreraRepository.findById(id);
    if (!carrera) {
      return res.status(404).json({ message: "Carrera no encontrada" });
    }

    res.json(carrera);
  },

  create: async (req: Request, res: Response) => {
    const { nombreCarrera, duracionCarrera } = req.body ?? {};

    if (!nombreCarrera || typeof duracionCarrera !== "number") {
      return res.status(400).json({
        message: "nombreCarrera y duracionCarrera son requeridos",
      });
    }

    try {
      const carrera = await carreraRepository.create({
        nombreCarrera,
        duracionCarrera,
      });
      res.status(201).json(carrera);
    } catch {
      res.status(500).json({ message: "Error al crear la carrera" });
    }
  },

  update: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Id inválido" });
    }

    const { nombreCarrera, duracionCarrera } = req.body;

    try {
      const carrera = await carreraRepository.update(id, {
        nombreCarrera,
        duracionCarrera,
      });
      res.json(carrera);
    } catch {
      res.status(404).json({ message: "Carrera no encontrada" });
    }
  },

  delete: async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Id inválido" });
    }

    try {
      await carreraRepository.delete(id);
      res.status(204).send();
    } catch {
      res.status(404).json({ message: "Carrera no encontrada" });
    }
  },
};
