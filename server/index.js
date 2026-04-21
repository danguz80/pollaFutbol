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
import sudamericanaClasificadosRoutes from "./routes/sudamericanaClasificados.js";
import estadisticasNacionalRoutes from "./routes/estadisticas_nacional.js";
import heroPartidosRoutes from "./routes/heroPartidos.js";
import notificacionesRoutes from "./routes/notificaciones.js";
import desempateTorneoRoutes from "./routes/desempateTorneo.js";
import mundialRoutes from "./routes/mundial.js";
import rankingsMundialRoutes from "./routes/rankingsMundial.js";
import ganadoresJornadaMundialRoutes from "./routes/ganadoresJornadaMundial.js";
import adminMundialRoutes from "./routes/adminMundial.js";
import mundialClasificadosRoutes from "./routes/mundialClasificados.js";
import clasificacionMundialRoutes from "./routes/clasificacionMundial.js";
import puntuacionMundialRoutes from "./routes/puntuacionMundial.js";
import calcularPuntosMundialRoutes from "./routes/calcularPuntosMundial.js";
import tesoreriaRoutes from "./routes/tesoreria.js";

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
    // En lugar de rechazar, permitir y dejar que otros middlewares manejen la seguridad
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 204
}));

// Agregar cabeceras CORS manualmente como fallback
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.includes('.app.github.dev'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

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

// Migración automática: agregar columnas copa_chile y copa_liga a predicciones_finales
(async () => {
  try {
    await pool.query(`
      ALTER TABLE predicciones_finales
      ADD COLUMN IF NOT EXISTS copa_chile VARCHAR(100),
      ADD COLUMN IF NOT EXISTS copa_liga VARCHAR(100)
    `);
  } catch (error) {
    console.error('❌ Error agregando columnas copa_chile y copa_liga:', error.message);
  }
})();

// Migración automática: agregar columnas copa_chile y copa_liga a prediccion_final_admin
(async () => {
  try {
    await pool.query(`
      ALTER TABLE prediccion_final_admin
      ADD COLUMN IF NOT EXISTS copa_chile VARCHAR(100),
      ADD COLUMN IF NOT EXISTS copa_liga VARCHAR(100)
    `);
  } catch (error) {
    console.error('❌ Error agregando columnas copa_chile y copa_liga a admin:', error.message);
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
app.use('/api/sudamericana-clasificados', sudamericanaClasificadosRoutes);
app.use('/api/ganadores-jornada', ganadoresJornadaRoutes);
app.use('/api/admin', adminTorneoRoutes);
app.use('/api/admin', adminLibertadoresRoutes);
app.use('/api/admin', adminSudamericanaRoutes);
app.use('/api/admin', adminMundialRoutes);
app.use('/api/estadisticas-nacional', estadisticasNacionalRoutes);
app.use('/api/hero-partidos-bonus', heroPartidosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/desempate-torneo', desempateTorneoRoutes);
app.use('/api/mundial', mundialRoutes);
app.use('/api/mundial-rankings', rankingsMundialRoutes);
app.use('/api/mundial-ganadores-jornada', ganadoresJornadaMundialRoutes);
app.use('/api/mundial-clasificacion', clasificacionMundialRoutes);
app.use('/api/mundial-clasificados', mundialClasificadosRoutes);
app.use('/api/mundial-puntuacion', puntuacionMundialRoutes);
app.use('/api/mundial-calcular', calcularPuntosMundialRoutes);
app.use('/api/tesoreria', tesoreriaRoutes);

app.get("/", (req, res) => {
  res.send("API de Campeonato Itaú funcionando ✅");
});

// Migración automática: tablas de tesorería
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tesoreria_configuracion (
        id              SERIAL PRIMARY KEY,
        torneo          VARCHAR(50) UNIQUE NOT NULL,
        cuota           INTEGER DEFAULT 0,
        premio_jornada  INTEGER DEFAULT 0,
        premio_acumulado_1 INTEGER DEFAULT 0,
        premio_acumulado_2 INTEGER DEFAULT 0,
        premio_acumulado_3 INTEGER DEFAULT 0,
        actualizado_en  TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO tesoreria_configuracion (torneo) VALUES
        ('torneo_nacional'), ('libertadores'), ('sudamericana'), ('mundial')
      ON CONFLICT (torneo) DO NOTHING
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tesoreria_pagos (
        id            SERIAL PRIMARY KEY,
        usuario_id    INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        torneo        VARCHAR(50) NOT NULL,
        cuota_pagada  BOOLEAN DEFAULT false,
        fecha_pago    TIMESTAMP,
        confirmado_por INT REFERENCES usuarios(id),
        UNIQUE (usuario_id, torneo)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tesoreria_premios_entregados (
        id            SERIAL PRIMARY KEY,
        usuario_id    INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        torneo        VARCHAR(50) NOT NULL,
        tipo          VARCHAR(50) NOT NULL,
        referencia    VARCHAR(100) NOT NULL,
        monto         INTEGER DEFAULT 0,
        entregado     BOOLEAN DEFAULT false,
        fecha_entrega TIMESTAMP,
        confirmado_por INT REFERENCES usuarios(id)
      )
    `);
    console.log('✅ Tablas de tesorería listas');
    // Convertir columnas DECIMAL a INTEGER si ya existían como DECIMAL
    await pool.query(`
      ALTER TABLE tesoreria_configuracion
        ALTER COLUMN cuota              TYPE INTEGER USING cuota::INTEGER,
        ALTER COLUMN premio_jornada     TYPE INTEGER USING premio_jornada::INTEGER,
        ALTER COLUMN premio_acumulado_1 TYPE INTEGER USING premio_acumulado_1::INTEGER,
        ALTER COLUMN premio_acumulado_2 TYPE INTEGER USING premio_acumulado_2::INTEGER,
        ALTER COLUMN premio_acumulado_3 TYPE INTEGER USING premio_acumulado_3::INTEGER
    `).catch(() => {});
    // Agregar columna premio_fase_grupos si no existe
    await pool.query(`
      ALTER TABLE tesoreria_configuracion
        ADD COLUMN IF NOT EXISTS premio_fase_grupos INTEGER DEFAULT 0
    `).catch(() => {});
    // Tabla para ganadores de fase de grupos del Mundial
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mundial_ganadores_fase_grupos (
        id         SERIAL PRIMARY KEY,
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntos     INTEGER DEFAULT 0,
        posicion   INT NOT NULL DEFAULT 1,
        UNIQUE (posicion)
      )
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE tesoreria_premios_entregados
        ALTER COLUMN monto TYPE INTEGER USING monto::INTEGER
    `).catch(() => {});
    // Agregar fecha_cierre a las tablas de jornadas que puedan no tenerla
    await pool.query(`ALTER TABLE jornadas ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE libertadores_jornadas ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE sudamericana_jornadas ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE mundial_jornadas ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP`).catch(() => {});
  } catch (error) {
    console.error('❌ Error en migración tesorería:', error.message);
  }
})();

// Cron para cierre automático de jornadas
setInterval(cierreAutomaticoJornadas, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
});
