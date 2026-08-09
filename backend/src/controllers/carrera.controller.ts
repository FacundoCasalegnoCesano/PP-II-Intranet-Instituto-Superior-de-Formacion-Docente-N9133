import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { carrera } from "../db/schema.js";
import {
  createCarreraSchema,
  updateCarreraSchema,
  carreraIdParamSchema,
} from "../validations/carrera.validation.js";

class CarreraController {
  getAll = async (_req: Request, res: Response) => {
    const carreras = await db.select().from(carrera);
    res.json({ data: carreras });
  };

  getById = async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);

    const [encontrada] = await db
      .select()
      .from(carrera)
      .where(eq(carrera.idCarrera, id));

    if (!encontrada) {
      return res.status(404).json({ message: "Carrera no encontrada" });
    }
    res.json({ data: encontrada });
  };

  create = async (req: Request, res: Response) => {
    const { nombreCarrera, duracionCarrera } = createCarreraSchema.parse(
      req.body,
    );

    try {
      const [result] = await db
        .insert(carrera)
        .values({ nombreCarrera, duracionCarrera });

      res.status(201).json({
        data: { idCarrera: result.insertId, nombreCarrera, duracionCarrera },
      });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return res
          .status(409)
          .json({ message: "Ya existe una carrera con ese nombre" });
      }
      throw err;
    }
  };

  update = async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);
    const data = updateCarreraSchema.parse(req.body);

    try {
      const [result] = await db
        .update(carrera)
        .set(data)
        .where(eq(carrera.idCarrera, id));

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Carrera no encontrada" });
      }

      const [actualizada] = await db
        .select()
        .from(carrera)
        .where(eq(carrera.idCarrera, id));
      res.json({ data: actualizada });
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return res
          .status(409)
          .json({ message: "Ya existe una carrera con ese nombre" });
      }
      throw err;
    }
  };

  delete = async (req: Request, res: Response) => {
    const { id } = carreraIdParamSchema.parse(req.params);

    const [existente] = await db
      .select()
      .from(carrera)
      .where(eq(carrera.idCarrera, id));

    if (!existente) {
      return res.status(404).json({ message: "Carrera no encontrada" });
    }

    await db.delete(carrera).where(eq(carrera.idCarrera, id));

    res.status(200).json({
      message: "Carrera eliminada correctamente",
      data: existente,
    });
  };
}

export const carreraController = new CarreraController();
