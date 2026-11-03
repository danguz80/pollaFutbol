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
import rankingUnificadoRoutes from "./routes/rankingUnificado.js";
import copaGinoPerezRoutes from "./routes/copaGinoPerez.js";
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
app.use('/api/ranking-unificado', rankingUnificadoRoutes);
app.use('/api/copa-gino-perez', copaGinoPerezRoutes);
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

// Migración automática: esquema de la Copa Gino Pérez
(async () => {
  try {
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo_copa_gino_perez BOOLEAN DEFAULT false`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_equipos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) UNIQUE NOT NULL,
        grupo INTEGER NOT NULL CHECK (grupo IN (1,2)),
        orden INTEGER NOT NULL CHECK (orden IN (1,2,3)),
        UNIQUE (grupo, orden)
      )
    `);

    await pool.query(`
      INSERT INTO copa_gino_perez_equipos (nombre, grupo, orden) VALUES
        ('H2', 1, 1),
        ('Cokal (Coker)', 1, 2),
        ('Resto del Mundo', 1, 3),
        ('LQQ (Quintero)', 2, 1),
        ('Los Chavos (Topping)', 2, 2),
        ('Norte - Sur (Cracking)', 2, 3)
      ON CONFLICT (nombre) DO NOTHING
    `);

    const equipos = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos`);
    const equipoId = (grupo, orden) => equipos.rows.find(e => e.grupo === grupo && e.orden === orden)?.id || null;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_partidos (
        id INTEGER PRIMARY KEY,
        grupo INTEGER,
        fase VARCHAR(20) NOT NULL,
        descripcion_local VARCHAR(100) NOT NULL,
        descripcion_visita VARCHAR(100) NOT NULL,
        equipo_local_id INTEGER REFERENCES copa_gino_perez_equipos(id),
        equipo_visita_id INTEGER REFERENCES copa_gino_perez_equipos(id),
        goles_local INTEGER,
        goles_visita INTEGER,
        ganador_id INTEGER REFERENCES copa_gino_perez_equipos(id),
        jugado BOOLEAN NOT NULL DEFAULT false
      )
    `);

    // Al ser todos-contra-todos dentro de cada grupo, los 3 enfrentamientos de
    // cada grupo son fijos y conocidos de antemano (el orden en que se jueguen
    // en la realidad no importa para el pronóstico, que es a ciegas por partido).
    const nombreG1 = equipos.rows.filter(e => e.grupo === 1).reduce((m, e) => ({ ...m, [e.orden]: e.nombre }), {});
    const nombreG2 = equipos.rows.filter(e => e.grupo === 2).reduce((m, e) => ({ ...m, [e.orden]: e.nombre }), {});

    const partidosSeed = [
      [1, 1, 'grupos', nombreG1[2], nombreG1[3], equipoId(1,2), equipoId(1,3)],
      [2, 1, 'grupos', nombreG1[1], nombreG1[3], equipoId(1,1), equipoId(1,3)],
      [3, 1, 'grupos', nombreG1[1], nombreG1[2], equipoId(1,1), equipoId(1,2)],
      [4, 2, 'grupos', nombreG2[2], nombreG2[3], equipoId(2,2), equipoId(2,3)],
      [5, 2, 'grupos', nombreG2[1], nombreG2[3], equipoId(2,1), equipoId(2,3)],
      [6, 2, 'grupos', nombreG2[1], nombreG2[2], equipoId(2,1), equipoId(2,2)],
      [7, null, 'final', '1° Grupo 1', '1° Grupo 2', null, null],
      [8, null, 'tercer_puesto', '2° Grupo 1', '2° Grupo 2', null, null],
      [9, null, 'verguenza', '3° Grupo 1', '3° Grupo 2', null, null],
    ];
    for (const p of partidosSeed) {
      await pool.query(`
        INSERT INTO copa_gino_perez_partidos
          (id, grupo, fase, descripcion_local, descripcion_visita, equipo_local_id, equipo_visita_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `, p);
      // Corrige partidos de grupo sembrados por una versión anterior de esta
      // migración (con equipos null/dinámicos) mientras el partido no se haya jugado.
      if (p[1] !== null) {
        await pool.query(`
          UPDATE copa_gino_perez_partidos
          SET descripcion_local = $2, descripcion_visita = $3, equipo_local_id = $4, equipo_visita_id = $5
          WHERE id = $1 AND jugado = false
        `, [p[0], p[3], p[4], p[5], p[6]]);
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_pronosticos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        partido_id INTEGER NOT NULL REFERENCES copa_gino_perez_partidos(id),
        goles_local INTEGER NOT NULL,
        goles_visita INTEGER NOT NULL,
        puntos_base INTEGER DEFAULT 0,
        bonus_multiplicador INTEGER DEFAULT 1,
        puntos INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (usuario_id, partido_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_predicciones_extra (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        bonus_grupo1_partido INTEGER,
        bonus_grupo2_partido INTEGER,
        bonus_final_partido INTEGER,
        bonus_final_multiplicador INTEGER DEFAULT 2,
        puntos_posiciones_grupos INTEGER DEFAULT 0,
        puntos_posiciones_finales INTEGER DEFAULT 0,
        grupos_guardados BOOLEAN DEFAULT false,
        final_guardado BOOLEAN DEFAULT false,
        enviado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE copa_gino_perez_predicciones_extra ADD COLUMN IF NOT EXISTS grupos_guardados BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE copa_gino_perez_predicciones_extra ADD COLUMN IF NOT EXISTS final_guardado BOOLEAN DEFAULT false`).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_puntuacion (
        id SERIAL PRIMARY KEY,
        fase VARCHAR(50) NOT NULL,
        concepto VARCHAR(100) NOT NULL,
        puntos INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (fase, concepto)
      )
    `);

    await pool.query(`
      INSERT INTO copa_gino_perez_puntuacion (fase, concepto, puntos) VALUES
        ('grupos', 'resultado', 1),
        ('grupos', 'diferencia', 3),
        ('grupos', 'exacto', 5),
        ('final', 'resultado', 3),
        ('final', 'diferencia', 5),
        ('final', 'exacto', 7),
        ('posiciones_grupo', '1er_lugar', 5),
        ('posiciones_grupo', '2do_lugar', 3),
        ('posiciones_grupo', '3er_lugar', 3),
        ('posiciones_finales', 'campeon', 20),
        ('posiciones_finales', 'subcampeon', 15),
        ('posiciones_finales', '3er_lugar', 10),
        ('posiciones_finales', '4to_lugar', 10),
        ('posiciones_finales', '5to_lugar', 10),
        ('posiciones_finales', 'ultimo', 15)
      ON CONFLICT (fase, concepto) DO NOTHING
    `);

    // Config: el admin cierra manualmente los pronósticos (igual que "cerrar
    // jornada" en los demás torneos) — un solo flag controla tanto que ya no
    // se puedan editar como que se revelen los pronósticos de todos.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS copa_gino_perez_config (
        id SERIAL PRIMARY KEY,
        cerrado BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      INSERT INTO copa_gino_perez_config (id, cerrado)
      VALUES (1, false)
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('✅ Esquema de Copa Gino Pérez listo');
  } catch (error) {
    console.error('❌ Error en migración Copa Gino Pérez:', error.message);
  }
})();

// Cron para cierre automático de jornadas
setInterval(cierreAutomaticoJornadas, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
});
