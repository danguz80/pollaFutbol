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
import estadisticasLibertadoresRoutes from "./routes/estadisticasLibertadores.js";
import clasificacionLibertadoresRoutes from "./routes/clasificacionLibertadores.js";
import rankingsHistoricosRoutes from "./routes/rankingsHistoricos.js";

dotenv.config();

const app = express();

// Configuración de CORS para permitir frontend local, Netlify y Codespaces
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://pollafutbol.netlify.app"
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    // Permitir cualquier origin de Codespaces
    if (origin.includes('.app.github.dev')) {
      return callback(null, true);
    }
    
    // Verificar si el origin está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('Origin no permitido:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Migración automática: agregar columna 'activa' si no existe
(async () => {
  try {
    await pool.query(`
      ALTER TABLE libertadores_jornadas 
      ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT false
    `);
    console.log('✅ Columna "activa" verificada en libertadores_jornadas');
  } catch (error) {
    console.error('❌ Error en migración de columna "activa":', error.message);
  }
})();

// Migración automática: agregar columna 'pais' a libertadores_equipos
(async () => {
  try {
    await pool.query(`
      ALTER TABLE libertadores_equipos 
      ADD COLUMN IF NOT EXISTS pais VARCHAR(10)
    `);
    console.log('✅ Columna "pais" verificada en libertadores_equipos');
  } catch (error) {
    console.error('❌ Error en migración de columna "pais":', error.message);
  }
})();

// Actualizar nombres de jornadas existentes
(async () => {
  try {
    const updates = [
      { numero: 1, nombre: 'Jornada 1' },
      { numero: 2, nombre: 'Jornada 2' },
      { numero: 3, nombre: 'Jornada 3' },
      { numero: 4, nombre: 'Jornada 4' },
      { numero: 5, nombre: 'Jornada 5' },
      { numero: 6, nombre: 'Jornada 6' },
      { numero: 7, nombre: 'Jornada 7' },
      { numero: 8, nombre: 'Jornada 8' },
      { numero: 9, nombre: 'Jornada 9' },
      { numero: 10, nombre: 'Jornada 10' }
    ];

    for (const jornada of updates) {
      await pool.query(
        'UPDATE libertadores_jornadas SET nombre = $1 WHERE numero = $2',
        [jornada.nombre, jornada.numero]
      );
    }
    console.log('✅ Nombres de jornadas actualizados');
  } catch (error) {
    console.error('❌ Error actualizando nombres de jornadas:', error.message);
  }
})();

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
app.use('/api/libertadores-estadisticas', estadisticasLibertadoresRoutes);
app.use('/api/libertadores-clasificacion', clasificacionLibertadoresRoutes);
app.use('/api/rankings-historicos', rankingsHistoricosRoutes);

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
