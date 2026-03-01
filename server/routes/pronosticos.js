// routes/pronosticos.js
import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { pool } from "../db/pool.js";
import fetch from "node-fetch";
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';
import { getLogoBase64 } from '../utils/logoHelper.js';

const router = express.Router();

// GUARDAR O ACTUALIZAR PRONÓSTICO (UPSERT) — bloquea si la jornada está cerrada
router.post("/", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada_id, partido_id, goles_local, goles_visita } = req.body;

  try {
    // 1. Verificar si el usuario está activo en Torneo Nacional
    const usuarioCheck = await pool.query(
      "SELECT activo_torneo_nacional FROM usuarios WHERE id = $1",
      [usuarioId]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_torneo_nacional !== true) {
      return res.status(403).json({ error: "No tienes acceso para ingresar pronósticos en el Torneo Nacional" });
    }

    // 2. Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      "SELECT cerrada FROM jornadas WHERE id = $1",
      [jornada_id]
    );
    if (jornadaCheck.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: "Esta jornada está cerrada. No se pueden modificar los pronósticos." });
    }

    // 3. Guardar o actualizar el pronóstico
    const result = await pool.query(
      `
      INSERT INTO pronosticos (usuario_id, jornada_id, partido_id, goles_local, goles_visita)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (usuario_id, jornada_id, partido_id)
      DO UPDATE SET goles_local = EXCLUDED.goles_local, goles_visita = EXCLUDED.goles_visita
      RETURNING id
      `,
      [usuarioId, jornada_id, partido_id, goles_local, goles_visita]
    );

    res.status(201).json({
      mensaje: "Pronóstico guardado/actualizado correctamente",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error al guardar/actualizar pronóstico:", error);
    res.status(500).json({ error: "No se pudo guardar/actualizar el pronóstico" });
  }
});

// CALCULAR PUNTAJES con BONUS y generar PDF con resultados
router.post("/calcular/:jornada", async (req, res) => {
  const { jornada } = req.params;

  try {
    const pronosticos = await pool.query(
      `SELECT p.id, p.usuario_id, p.partido_id, p.goles_local, p.goles_visita,
              pa.goles_local AS real_local, pa.goles_visita AS real_visita,
              COALESCE(pa.bonus, 1) AS bonus
       FROM pronosticos p
       JOIN partidos pa ON p.partido_id = pa.id
       JOIN jornadas j ON pa.jornada_id = j.id
       WHERE j.numero = $1`,
      [jornada]
    );

    if (pronosticos.rowCount === 0) {
      return res.status(404).json({ error: "No hay pronósticos para esta jornada" });
    }

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      let goles_local = p.real_local;
      let goles_visita = p.real_visita;
      const bonus = parseInt(p.bonus) || 1;

      // Si faltan resultados, saltar este partido (no actualizar desde API)
      if (goles_local === null || goles_visita === null) {
        console.warn(`Partido ${p.partido_id} no tiene resultados, saltando cálculo de puntaje`);
        continue;
      }

      // Calcular puntaje base
      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = goles_local - goles_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === goles_local && p.goles_visita === goles_visita) {
        puntosBase = 5;
      } else if (pred_dif === real_dif) {
        puntosBase = 3;
      } else if (pred_signo === real_signo) {
        puntosBase = 1;
      }

      // Multiplicar por bonus
      const puntos = puntosBase * bonus;

      await pool.query(
        `UPDATE pronosticos SET puntos = $1 WHERE id = $2`,
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({
      mensaje: '✅ Puntajes calculados correctamente (con bonus)',
      pronosticos: pronosticos.rowCount,
      actualizados
    });

  } catch (error) {
    console.error("Error al calcular puntajes:", error);
    res.status(500).json({ error: "Error interno al calcular los puntajes" });
  }
});

// GET /api/pronosticos/mis (tus pronósticos)
router.get("/mis", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  try {
    const result = await pool.query(`
      SELECT 
        p.id AS pronostico_id,
        j.numero AS jornada,
        pa.nombre_local,
        pa.nombre_visita,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1
      ORDER BY j.numero, pa.fecha
    `, [usuarioId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener tus pronósticos" });
  }
});

// GET /api/pronosticos/:jornada (tus pronósticos para una jornada)
router.get("/:jornada", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        p.id AS pronostico_id,
        p.partido_id,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
      ORDER BY pa.fecha ASC
      `,
      [usuarioId, jornada]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener pronósticos:", error);
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});

// Pronósticos de todos los usuarios en una jornada
router.get("/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (u.id, pa.id)
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil as usuario_foto_perfil,
        p.id AS pronostico_id,
        p.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.id, pa.id, p.id DESC
      `,
      [jornada]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});

// Ranking jornada
router.get("/ranking/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    // Primero obtener el ID de la jornada
    const jornadaResult = await pool.query(
      'SELECT id FROM jornadas WHERE numero = $1',
      [jornada]
    );
    
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    
    const jornadaId = jornadaResult.rows[0].id;
    
    console.log(`📊 Consultando ranking para jornada ${jornada} (ID: ${jornadaId})`);
    
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      WHERE (pa.jornada_id = $1 OR pa.jornada_id IS NULL)
        AND u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntos_jornada DESC, usuario ASC`,
      [jornadaId]
    );
    
    console.log(`✅ Ranking calculado: ${result.rows.length} usuarios, máximo ${result.rows[0]?.puntos_jornada || 0} pts`);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error en ranking de jornada:", error);
    res.status(500).json({ error: "No se pudo obtener el ranking de la jornada" });
  }
});

// Ranking general
router.get("/ranking/general", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos),0) as puntaje_total
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      WHERE u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, usuario ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el ranking general" });
  }
});

// Ranking acumulado hasta una jornada específica (para simulador)
router.get("/ranking/acumulado-hasta/:jornadaNumero", async (req, res) => {
  try {
    const { jornadaNumero } = req.params;
    
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos),0) as puntaje_total
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      LEFT JOIN jornadas j ON j.id = p.jornada_id
      WHERE u.activo_torneo_nacional = true
        AND u.rol != 'admin'
        AND (j.numero IS NULL OR j.numero <= $1)
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, usuario ASC`,
      [jornadaNumero]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error en ranking acumulado hasta jornada:", error);
    res.status(500).json({ error: "No se pudo obtener el ranking acumulado" });
  }
});

// ==================== FUNCIÓN PARA GENERAR PDF CON RESULTADOS ====================
async function generarPDFConResultados(jornadaNumero) {
  try {
    // 1. Obtener pronósticos con resultados reales y puntos
    const pronosticosQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local AS pred_local,
        p.goles_visita AS pred_visita,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        p.puntos,
        COALESCE(pa.bonus, 1) AS bonus
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.nombre, pa.fecha`,
      [jornadaNumero]
    );

    // 2. Obtener ranking de la jornada (desde ganadores_jornada)
    const rankingJornadaQuery = await pool.query(
      `SELECT 
        ROW_NUMBER() OVER (ORDER BY gj.puntaje DESC, u.nombre ASC) AS posicion,
        u.nombre AS usuario,
        gj.puntaje AS puntos_jornada
      FROM ganadores_jornada gj
      JOIN usuarios u ON gj.jugador_id = u.id
      JOIN jornadas j ON gj.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY gj.puntaje DESC, u.nombre ASC`,
      [jornadaNumero]
    );

    // 3. Obtener ranking acumulado
    const rankingAcumuladoQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        COALESCE(SUM(p.puntos), 0) AS puntaje_total,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      LEFT JOIN jornadas j ON pa.jornada_id = j.id
      WHERE u.activo_torneo_nacional = true
        AND (j.numero IS NULL OR j.numero <= $1)
      GROUP BY u.id, u.nombre
      ORDER BY puntaje_total DESC, usuario ASC
      LIMIT 10`,
      [jornadaNumero]
    );

    // 4. Obtener ganadores de la jornada
    const ganadoresQuery = await pool.query(
      `SELECT u.nombre AS usuario, gj.puntaje AS puntos_jornada
      FROM ganadores_jornada gj
      JOIN usuarios u ON gj.jugador_id = u.id
      JOIN jornadas j ON gj.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY gj.puntaje DESC
      LIMIT 1`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    const rankingJornada = rankingJornadaQuery.rows;
    const rankingAcumulado = rankingAcumuladoQuery.rows;
    const ganadores = ganadoresQuery.rows;

    console.log(`📊 Datos obtenidos - Pronósticos: ${pronosticos.length}, Ranking Jornada: ${rankingJornada.length}, Ganadores: ${ganadores.length}`);

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach((p) => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = [];
      }
      pronosticosPorUsuario[p.usuario].push(p);
    });

    // Obtener logos (usar URLs directas)
    const logoItauBase64 = 'https://pollafutbol.netlify.app/logos/itau-logo.png';
    const logoTorneoBase64 = 'https://pollafutbol.netlify.app/logos/torneo-logo.png';

    // Generar HTML
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          padding: 20px; 
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: #333;
        }
        .header {
          text-align: center;
          background: white;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header img {
          height: 60px;
          margin: 0 15px;
          vertical-align: middle;
        }
        .header h1 {
          color: #1e3c72;
          font-size: 28px;
          margin: 15px 0 5px 0;
        }
        .header p {
          color: #666;
          font-size: 16px;
        }
        
        .usuario-section {
          background: white;
          padding: 20px;
          margin-bottom: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .usuario-section h2 {
          color: #1e3c72;
          font-size: 20px;
          margin-bottom: 15px;
          border-bottom: 3px solid #ff6b35;
          padding-bottom: 8px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #1e3c72;
          color: white;
          padding: 12px 8px;
          text-align: left;
          font-size: 13px;
          font-weight: bold;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #e0e0e0;
          font-size: 12px;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .partido-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .equipo-logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }
        .vs {
          color: #999;
          font-weight: bold;
          margin: 0 4px;
        }
        .resultado {
          font-weight: bold;
          color: #1e3c72;
        }
        .puntos-cell {
          font-weight: bold;
          font-size: 14px;
        }
        .puntos-5 { color: #27ae60; }
        .puntos-3 { color: #f39c12; }
        .puntos-1 { color: #e67e22; }
        .puntos-0 { color: #c0392b; }
        .bonus-badge {
          display: inline-block;
          background: linear-gradient(135deg, #ff6b35, #ff8c42);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: bold;
          margin-left: 5px;
        }

        .rankings-section {
          background: white;
          padding: 20px;
          margin-bottom: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .rankings-section h2 {
          color: #1e3c72;
          font-size: 22px;
          margin-bottom: 15px;
          text-align: center;
        }
        .ranking-table {
          margin-top: 15px;
        }
        .ranking-table th {
          background: #27ae60;
        }
        .ranking-table .posicion {
          text-align: center;
          font-weight: bold;
          font-size: 16px;
          color: #1e3c72;
        }
        .ranking-table .top-1 {
          background: #ffd700 !important;
          color: #000 !important;
        }
        .ranking-table .top-2 {
          background: #c0c0c0 !important;
          color: #000 !important;
        }
        .ranking-table .top-3 {
          background: #cd7f32 !important;
          color: #000 !important;
        }

        .ganadores-section {
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          padding: 25px;
          margin-bottom: 25px;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          text-align: center;
          page-break-inside: avoid;
        }
        .ganadores-section h2 {
          color: #1e3c72;
          font-size: 26px;
          margin-bottom: 15px;
        }
        .ganador-nombre {
          font-size: 24px;
          font-weight: bold;
          color: #1e3c72;
          margin: 10px 0;
        }
        .ganador-puntos {
          font-size: 18px;
          color: #666;
        }

        .footer {
          text-align: center;
          color: white;
          font-size: 12px;
          margin-top: 30px;
          padding: 15px;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoItauBase64}" alt="Itau">
        <img src="${logoTorneoBase64}" alt="Torneo">
        <h1>📊 RESULTADOS JORNADA ${jornadaNumero}</h1>
        <p>Torneo Nacional - Campeonato Itaú</p>
        <p style="font-size: 14px; color: #999; margin-top: 10px;">
          Fecha de generación: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
        </p>
      </div>
    `;

    // GANADORES DE LA JORNADA
    if (ganadores.length > 0) {
      html += `
      <div class="ganadores-section">
        <h2>🏆 GANADOR${ganadores.length > 1 ? 'ES' : ''} DE LA JORNADA</h2>
      `;
      ganadores.forEach((g) => {
        html += `
        <div class="ganador-nombre">${g.usuario}</div>
        <div class="ganador-puntos">${g.puntos_jornada} puntos</div>
        `;
      });
      html += `</div>`;
    }

    // RANKING DE LA JORNADA
    if (rankingJornada.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>🥇 RANKING DE LA JORNADA ${jornadaNumero}</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;
      rankingJornada.forEach((r) => {
        let rowClass = '';
        if (r.posicion === 1) rowClass = 'top-1';
        else if (r.posicion === 2) rowClass = 'top-2';
        else if (r.posicion === 3) rowClass = 'top-3';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntos_jornada}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // RANKING ACUMULADO
    if (rankingAcumulado.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>📈 RANKING ACUMULADO (hasta Jornada ${jornadaNumero})</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos Totales</th>
            </tr>
          </thead>
          <tbody>
      `;
      rankingAcumulado.forEach((r) => {
        let rowClass = '';
        if (r.posicion === 1) rowClass = 'top-1';
        else if (r.posicion === 2) rowClass = 'top-2';
        else if (r.posicion === 3) rowClass = 'top-3';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntaje_total}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // PRONÓSTICOS POR USUARIO
    for (const [usuario, pronosticosUsuario] of Object.entries(pronosticosPorUsuario)) {
      html += `
      <div class="usuario-section">
        <h2>👤 ${usuario}</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 35%;">Partido</th>
              <th style="width: 15%;">Pronóstico</th>
              <th style="width: 15%;">Resultado</th>
              <th style="width: 10%;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      pronosticosUsuario.forEach((p) => {
        const logoLocal = getLogoBase64(p.nombre_local);
        const logoVisita = getLogoBase64(p.nombre_visita);
        
        const pronostico = `${p.pred_local} - ${p.pred_visita}`;
        const resultado = (p.real_local !== null && p.real_visita !== null) 
          ? `${p.real_local} - ${p.real_visita}` 
          : 'Pendiente';
        
        const puntos = p.puntos || 0;
        let puntosClass = 'puntos-0';
        const puntosBase = p.bonus > 1 ? puntos / p.bonus : puntos;
        if (puntosBase === 5) puntosClass = 'puntos-5';
        else if (puntosBase === 3) puntosClass = 'puntos-3';
        else if (puntosBase === 1) puntosClass = 'puntos-1';

        const bonusBadge = p.bonus > 1 ? `<span class="bonus-badge">x${p.bonus}</span>` : '';

        html += `
            <tr>
              <td>
                <div class="partido-cell">
                  <img src="${logoLocal}" class="equipo-logo" alt="${p.nombre_local}">
                  <span>${p.nombre_local}</span>
                  <span class="vs">vs</span>
                  <img src="${logoVisita}" class="equipo-logo" alt="${p.nombre_visita}">
                  <span>${p.nombre_visita}</span>
                </div>
              </td>
              <td style="text-align: center;">${pronostico}</td>
              <td style="text-align: center;" class="resultado">${resultado}</td>
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">
                ${puntos} ${bonusBadge}
              </td>
            </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    html += `
      <div class="footer">
        <p>Campeonato Itaú ${new Date().getFullYear()} • Torneo Nacional</p>
        <p>Sistema de Pronósticos Deportivos</p>
      </div>
    </body>
    </html>
    `;

    // Generar PDF
    console.log('📝 Generando PDF desde HTML...');
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log(`✅ PDF generado, tamaño: ${pdfBuffer.length} bytes`);

    // Enviar por email
    const whatsappService = getWhatsAppService();
    const nombreArchivo = `Resultados_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    console.log(`📧 Enviando PDF por email...`);
    const resultadoEmail = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      jornadaNumero,
      'Torneo Nacional'
    );

    if (!resultadoEmail.success) {
      throw new Error(resultadoEmail.mensaje);
    }

    console.log(`✅ PDF con resultados de jornada ${jornadaNumero} generado y enviado exitosamente`);
    return true;

  } catch (error) {
    console.error('Error al generar PDF con resultados:', error);
    throw error;
  }
}

// Generar PDF con pronósticos de una jornada
router.post('/generar-pdf/:jornada', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornada } = req.params;

    console.log(`📄 Generando PDF para jornada ${jornada}...`);

    // Obtener todos los pronósticos de la jornada
    const pronosticosResult = await pool.query(`
      SELECT 
        u.nombre as usuario,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        pa.goles_local as real_local,
        pa.goles_visita as real_visita,
        p.puntos
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.nombre, pa.fecha
    `, [jornada]);

    if (pronosticosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pronósticos para esta jornada' });
    }

    const pronosticos = pronosticosResult.rows;

    // Obtener lista única de partidos ordenados por fecha
    const partidosUnicos = [];
    const partidosVistos = new Set();
    pronosticos.forEach(p => {
      const key = `${p.nombre_local}|${p.nombre_visita}|${p.fecha}`;
      if (!partidosVistos.has(key)) {
        partidosVistos.add(key);
        partidosUnicos.push({
          nombre_local: p.nombre_local,
          nombre_visita: p.nombre_visita,
          fecha: p.fecha
        });
      }
    });

    // Ordenar partidos por fecha
    partidosUnicos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {};
      }
      const key = `${p.nombre_local}|${p.nombre_visita}`;
      pronosticosPorUsuario[p.usuario][key] = p;
    });

    // Generar HTML para el PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .header {
            text-align: center;
            color: #0066cc;
            margin-bottom: 15px;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 10px;
          }
          .header h1 {
            margin: 0;
            font-size: 34px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
            font-size: 19px;
          }
          .usuario-section {
            background: white;
            padding: 10px;
            margin-bottom: 12px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            page-break-inside: avoid;
          }
          .usuario-nombre {
            font-size: 22px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 6px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 15px;
          }
          th {
            background-color: #0066cc;
            color: white;
            padding: 8px;
            text-align: left;
            font-size: 18px;
            font-weight: bold;
          }
          td {
            padding: 6px;
            border-bottom: 1px solid #e0e0e0;
            font-size: 17px;
            font-weight: bold;
          }
          tr:hover {
            background-color: #f9f9f9;
          }
          .pronostico {
            font-weight: bold;
            color: #0066cc;
            font-size: 22px;
          }
          .partido-cell {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .equipo-container {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .logo-equipo {
            width: 30px;
            height: 30px;
            object-fit: contain;
            vertical-align: middle;
          }
          .vs-separator {
            margin: 0 8px;
            color: #999;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #999;
            font-size: 15px;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⚽ Pronósticos Torneo Nacional</h1>
          <p>Jornada ${jornada}</p>
          <p><strong>Documento Testigo - Pronósticos Registrados</strong></p>
          <p>Fecha de generación: ${new Date().toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>

        ${Object.keys(pronosticosPorUsuario).sort().map(usuario => `
          <div class="usuario-section">
            <div class="usuario-nombre">👤 ${usuario}</div>
            <table>
              <thead>
                <tr>
                  <th>Partido</th>
                  <th>Pronóstico</th>
                </tr>
              </thead>
              <tbody>
                ${partidosUnicos.map(partido => {
                  const key = `${partido.nombre_local}|${partido.nombre_visita}`;
                  const p = pronosticosPorUsuario[usuario][key];
                  
                  // Obtener logos de los equipos
                  const logoLocal = getLogoBase64(partido.nombre_local) || '';
                  const logoVisita = getLogoBase64(partido.nombre_visita) || '';
                  
                  if (!p) {
                    return `
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center;">
                            ${logoLocal ? `<img src="${logoLocal}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                            <span>${partido.nombre_local}</span>
                            <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                            ${logoVisita ? `<img src="${logoVisita}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                            <span>${partido.nombre_visita}</span>
                          </div>
                        </td>
                        <td class="pronostico" style="color: #999;">Sin pronóstico</td>
                      </tr>
                    `;
                  }
                  
                  const pronostico = `${p.goles_local}-${p.goles_visita}`;
                  
                  return `
                    <tr>
                      <td>
                        <div style="display: flex; align-items: center;">
                          ${logoLocal ? `<img src="${logoLocal}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                          <span>${p.nombre_local}</span>
                          <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                          ${logoVisita ? `<img src="${logoVisita}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                          <span>${p.nombre_visita}</span>
                        </div>
                      </td>
                      <td class="pronostico">${pronostico}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        <div class="footer">
          <p>Campeonato Polla Fútbol - Torneo Nacional</p>
          <p>Este documento certifica los pronósticos registrados antes del inicio de la jornada</p>
        </div>
      </body>
      </html>
    `;

    // Generar PDF con html-pdf-node
    console.log('📄 Generando PDF...');
    
    const options = { 
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    };
    
    const file = { content: htmlContent };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    
    console.log('✅ PDF generado exitosamente');

    // Enviar PDF por email
    const nombreArchivo = `TorneoNacional_Jornada_${jornada}_${new Date().toISOString().split('T')[0]}.pdf`;
    const whatsappService = getWhatsAppService();
    const resultado = await whatsappService.enviarEmailConPDF(
      pdfBuffer, 
      nombreArchivo, 
      jornada,
      'Torneo Nacional'
    );

    if (resultado.success) {
      res.json({ 
        mensaje: 'PDF generado y enviado exitosamente',
        detalles: resultado.mensaje
      });
    } else {
      res.status(500).json({ 
        error: 'PDF generado pero hubo un error al enviarlo',
        detalles: resultado.mensaje 
      });
    }

  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({ 
      error: 'Error generando PDF',
      detalles: error.message 
    });
  }
});

// GET /api/pronosticos/resumen/jornada/:jornada - Resumen agrupado de pronósticos por jornada
router.get("/resumen/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;

  try {
    // Obtener todos los pronósticos de la jornada con información del partido y usuarios
    const result = await pool.query(
      `SELECT 
        p.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        u.id as usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE j.numero = $1
        AND u.activo_torneo_nacional = true
        AND u.rol != 'admin'
      ORDER BY pa.fecha ASC, pa.id ASC, p.goles_local, p.goles_visita`,
      [jornada]
    );

    if (result.rows.length === 0) {
      return res.json({ partidos: [], totalPronosticos: 0 });
    }

    // Agrupar pronósticos por partido
    const partidosMap = new Map();

    result.rows.forEach(row => {
      const partidoKey = row.partido_id;
      
      if (!partidosMap.has(partidoKey)) {
        partidosMap.set(partidoKey, {
          partido_id: row.partido_id,
          nombre_local: row.nombre_local,
          nombre_visita: row.nombre_visita,
          fecha: row.fecha,
          pronosticos: []
        });
      }

      partidosMap.get(partidoKey).pronosticos.push({
        goles_local: row.goles_local,
        goles_visita: row.goles_visita,
        usuario_id: row.usuario_id,
        usuario_nombre: row.usuario_nombre,
        foto_perfil: row.foto_perfil
      });
    });

    // Para cada partido, agrupar pronósticos por resultado
    const partidosAgrupados = Array.from(partidosMap.values()).map(partido => {
      const pronosticosAgrupados = new Map();
      const totalPronosticosPartido = partido.pronosticos.length;

      partido.pronosticos.forEach(pron => {
        const key = `${pron.goles_local}-${pron.goles_visita}`;
        
        if (!pronosticosAgrupados.has(key)) {
          pronosticosAgrupados.set(key, {
            resultado: key,
            goles_local: pron.goles_local,
            goles_visita: pron.goles_visita,
            cantidad: 0,
            porcentaje: 0,
            usuarios: []
          });
        }

        const grupo = pronosticosAgrupados.get(key);
        grupo.cantidad++;
        grupo.usuarios.push({
          id: pron.usuario_id,
          nombre: pron.usuario_nombre,
          foto_perfil: pron.foto_perfil
        });
      });

      // Calcular porcentajes
      pronosticosAgrupados.forEach(grupo => {
        grupo.porcentaje = ((grupo.cantidad / totalPronosticosPartido) * 100).toFixed(1);
      });

      // Convertir a array y ordenar por cantidad descendente
      const gruposArray = Array.from(pronosticosAgrupados.values())
        .sort((a, b) => b.cantidad - a.cantidad);

      return {
        partido_id: partido.partido_id,
        nombre_local: partido.nombre_local,
        nombre_visita: partido.nombre_visita,
        fecha: partido.fecha,
        total_pronosticos: totalPronosticosPartido,
        grupos: gruposArray
      };
    });

    res.json({
      jornada: parseInt(jornada),
      partidos: partidosAgrupados,
      totalPronosticos: result.rows.length
    });

  } catch (error) {
    console.error("Error obteniendo resumen de pronósticos:", error);
    res.status(500).json({ 
      error: "No se pudo obtener el resumen de pronósticos",
      detalles: error.message
    });
  }
});

export default router;
