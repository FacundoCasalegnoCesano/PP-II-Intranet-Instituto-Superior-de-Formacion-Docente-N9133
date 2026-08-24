import express from "express";
import type { Request, Response } from "express";
import alumnoRoutes from "./routes/alumnoRoutes.js";
import carreraRoutes from "./routes/carreraRoutes.js";

const app = express();

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Working now!");
});

app.use(carreraRoutes);
app.listen(3000, () => {
  console.log("Server working!");
});
