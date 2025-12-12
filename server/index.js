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
import prediccionesFinalesRouter from "./routes/prediccionesFinales.js";
import prediccionFinalAdminRouter from "./routes/prediccionFinalAdmin.js";
import whatsappRoutes from "./routes/whatsapp.js";
import { getWhatsAppService } from "./services/whatsappService.js";
import { cierreAutomaticoJornadas } from "./routes/jornadas.js";
import libertadoresRoutes from "./routes/libertadores.js";
import libertadoresPronosticosRoutes from "./routes/libertadoresPronosticos.js";

dotenv.config();

const app = express();

// Configuración de CORS para permitir frontend local, Netlify y Codespaces
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://pollafutbol.netlify.app",
  /https:\/\/.*\.app\.github\.dev$/ // Permitir todos los Codespaces
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    // Verificar si el origin está en la lista permitida
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('Origin no permitido:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// IMPORTANTE: Rutas más específicas deben ir ANTES que las generales
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
app.use("/api/predicciones-finales", prediccionesFinalesRouter);
app.use("/api/prediccion-final-admin", prediccionFinalAdminRouter);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/libertadores', libertadoresRoutes);
app.use('/api/libertadores-pronosticos', libertadoresPronosticosRoutes);

app.get("/", (req, res) => {
  res.send("API de Campeonato Itaú funcionando ✅");
});

// Cron para cierre automático de jornadas
setInterval(cierreAutomaticoJornadas, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log('📧 Servicio de notificaciones por email configurado');
});
