import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool.js";
import jornadasRoutes from "./routes/jornadas.js";
import fixturesRoutes from "./routes/fixtures.js";
import chileRoutes from "./routes/chile.js";
import authRoutes from "./routes/auth.js";
import pronosticosRoutes from "./routes/pronosticos.js";
import importarJornadasRoutes from "./routes/importarJornadas.js";
import asignarJornadas240 from "./routes/asignarJornadas240.js";
import usuariosRoutes from "./routes/usuarios.js";
import adminRoutes from "./routes/admin.js";
import ganadoresRouter from "./routes/ganadores.js";
import pronosticosSudamericanaRouter from "./routes/pronosticosSudamericana.js";
import puntajesSudamericanaRouter from "./routes/puntajesSudamericana.js";
import clasificacionSudamericanaRouter from './routes/clasificacionSudamericana.js';
import sudamericanaRankingRouter from './routes/sudamericanaRanking.js';
import { router as adminSudamericanaRouter, cierreAutomaticoSudamericana } from "./routes/admin_sud.js";
import sudamericanaRouter from "./routes/sudamericana.js";

dotenv.config();

const app = express();

// SOLO ESTA LÍNEA para permitir tu frontend de Netlify:
app.use(cors({
  origin: "https://pollafutbol.netlify.app",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json());

app.use("/api/jornadas", jornadasRoutes);
app.use("/api/fixtures", fixturesRoutes);
app.use("/api/chile", chileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pronosticos", pronosticosRoutes);
app.use("/api/admin", importarJornadasRoutes);
app.use("/api/admin", asignarJornadas240);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ganadores", ganadoresRouter);
app.use("/api/sudamericana", sudamericanaRouter);
app.use("/api/sudamericana", pronosticosSudamericanaRouter);
app.use('/api/sudamericana', puntajesSudamericanaRouter);
app.use('/api/sudamericana', clasificacionSudamericanaRouter);
app.use('/api/sudamericana', sudamericanaRankingRouter);
app.use("/api/jornadas/sudamericana", adminSudamericanaRouter);

app.get("/", (req, res) => {
  res.send("API de Campeonato Itaú funcionando ✅");
});

// Cron para cierre automático de edición de pronósticos Sudamericana
setInterval(cierreAutomaticoSudamericana, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
