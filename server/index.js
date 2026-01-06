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
import puntuacionLibertadoresRoutes from "./routes/puntuacionLibertadores.js";
import calcularPuntosLibertadoresRoutes from "./routes/calcularPuntosLibertadores.js";
import rankingsLibertadoresRoutes from "./routes/rankingsLibertadores.js";
import libertadoresClasificadosRoutes from "./routes/libertadoresClasificados.js";
import rankingsHistoricosRoutes from "./routes/rankingsHistoricos.js";
import ganadoresJornadaLibertadoresRoutes from "./routes/ganadoresJornadaLibertadores.js";
import ganadoresJornadaSudamericanaRoutes from "./routes/ganadoresJornadaSudamericana.js";
import ganadoresJornadaRoutes from "./routes/ganadoresJornada.js";
import adminTorneoRoutes from "./routes/adminTorneo.js";
import adminLibertadoresRoutes from "./routes/adminLibertadores.js";
import adminSudamericanaRoutes from "./routes/adminSudamericana.js";
import sudamericanaRoutes from "./routes/sudamericana.js";
import sudamericanaPronosticosRoutes from "./routes/sudamericanaPronosticos.js";
import puntuacionSudamericanaRoutes from "./routes/puntuacionSudamericana.js";
import estadisticasSudamericanaRoutes from "./routes/estadisticasSudamericana.js";
import clasificacionSudamericanaRoutes from "./routes/clasificacionSudamericana.js";
import rankingsSudamericanaRoutes from "./routes/rankingsSudamericana.js";
import calcularPuntosSudamericanaRoutes from "./routes/calcularPuntosSudamericana.js";
import estadisticasNacionalRoutes from "./routes/estadisticas_nacional.js";
import heroPartidosRoutes from "./routes/heroPartidos.js";
import notificacionesRoutes from "./routes/notificaciones.js";

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
  } catch (error) {
    console.error('❌ Error en migración de columna "pais":', error.message);
  }
})();

// Migración automática: crear tabla libertadores_puntuacion
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_puntuacion (
        id SERIAL PRIMARY KEY,
        fase VARCHAR(50) NOT NULL,
        concepto VARCHAR(100) NOT NULL,
        puntos INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Error creando tabla libertadores_puntuacion:', error.message);
  }
})();

// Migración automática: crear tabla libertadores_puntos_clasificacion
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_puntos_clasificacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        partido_id INTEGER,
        jornada_numero INTEGER NOT NULL,
        equipo_clasificado VARCHAR(100) NOT NULL,
        fase_clasificado VARCHAR(50) NOT NULL,
        puntos INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, partido_id, jornada_numero)
      )
    `);
    
    // Migración: permitir partido_id NULL para clasificados de fase de grupos
    await pool.query(`
      ALTER TABLE libertadores_puntos_clasificacion 
      ALTER COLUMN partido_id DROP NOT NULL
    `).catch(() => {
      // Si ya está modificado, ignorar error
    });
  } catch (error) {
    console.error('❌ Error creando tabla libertadores_puntos_clasificacion:', error.message);
  }
})();

// Migración automática: crear tabla libertadores_predicciones_campeon
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_predicciones_campeon (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE,
        campeon VARCHAR(100),
        subcampeon VARCHAR(100),
        puntos_campeon INTEGER DEFAULT 0,
        puntos_subcampeon INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Error creando tabla libertadores_predicciones_campeon:', error.message);
  }
})();

// Migración automática: crear tabla libertadores_ganadores_jornada
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_ganadores_jornada (
        id SERIAL PRIMARY KEY,
        jornada_numero INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jornada_numero, usuario_id)
      )
    `);
  } catch (error) {
    console.error('❌ Error creando tabla libertadores_ganadores_jornada:', error.message);
  }
})();

// Migración automática: agregar columna puntaje a ganadores_jornada
(async () => {
  try {
    await pool.query(`
      ALTER TABLE ganadores_jornada
      ADD COLUMN IF NOT EXISTS puntaje INTEGER
    `);
  } catch (error) {
    console.error('❌ Error agregando columna puntaje:', error.message);
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
app.use('/api/libertadores-puntuacion', puntuacionLibertadoresRoutes);
app.use('/api/libertadores-calcular', calcularPuntosLibertadoresRoutes);
app.use('/api/libertadores-rankings', rankingsLibertadoresRoutes);
app.use('/api/libertadores-clasificados', libertadoresClasificadosRoutes);
app.use('/api/rankings-historicos', rankingsHistoricosRoutes);
app.use('/api/libertadores-ganadores-jornada', ganadoresJornadaLibertadoresRoutes);
app.use('/api/sudamericana-ganadores-jornada', ganadoresJornadaSudamericanaRoutes);
app.use('/api/sudamericana', sudamericanaRoutes);
app.use('/api/sudamericana/pronosticos', sudamericanaPronosticosRoutes);
app.use('/api/sudamericana-puntuacion', puntuacionSudamericanaRoutes);
app.use('/api/sudamericana-estadisticas', estadisticasSudamericanaRoutes);
app.use('/api/sudamericana-clasificacion', clasificacionSudamericanaRoutes);
app.use('/api/sudamericana-rankings', rankingsSudamericanaRoutes);
app.use('/api/sudamericana-calcular', calcularPuntosSudamericanaRoutes);
app.use('/api/ganadores-jornada', ganadoresJornadaRoutes);
app.use('/api/admin', adminTorneoRoutes);
app.use('/api/admin', adminLibertadoresRoutes);
app.use('/api/admin', adminSudamericanaRoutes);
app.use('/api/estadisticas-nacional', estadisticasNacionalRoutes);
app.use('/api/hero-partidos-bonus', heroPartidosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

app.get("/", (req, res) => {
  res.send("API de Campeonato Itaú funcionando ✅");
});

// Cron para cierre automático de jornadas
setInterval(cierreAutomaticoJornadas, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
});
