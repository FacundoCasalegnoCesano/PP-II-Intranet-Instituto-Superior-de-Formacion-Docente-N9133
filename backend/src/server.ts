import express from "express";
import type { Request, Response } from "express";
import alumnoRoutes from "./routes/alumnoRoutes.js";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.send("Working now!");
});

app.use("/alumnos", alumnoRoutes);

app.listen(3000, () => {
  console.log("Server working!");
});
