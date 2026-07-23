import { Router } from "express";
import { carreraController } from "../controllers/carrera.controller.js";

const router = Router();

router.post("/carreras", carreraController.create);
router.get("/carreras", carreraController.getAll);
router.get("/carreras/:id", carreraController.getById);
router.put("/carreras/:id", carreraController.update);
router.delete("/carreras/:id", carreraController.delete);

export default router;
