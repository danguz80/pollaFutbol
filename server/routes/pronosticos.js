// routes/pronosticos.js
import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { pool } from "../db/pool.js";
import fetch from "node-fetch";
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';

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
      console.log('🚫 Usuario sin acceso a Torneo Nacional:', usuarioId, usuarioCheck.rows[0]);
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

// CALCULAR PUNTAJES con BONUS
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
      mensaje: `✅ Puntajes calculados correctamente (con bonus)`,
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
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        u.foto_perfil,
        SUM(p.puntos) as puntaje_jornada
      FROM usuarios u
      JOIN pronosticos p ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1 AND u.activo_torneo_nacional = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_jornada DESC, usuario ASC`,
      [jornada]
    );
    res.json(result.rows);
  } catch (error) {
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
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, usuario ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el ranking general" });
  }
});

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
            margin-bottom: 30px;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
            font-size: 16px;
          }
          .usuario-section {
            background: white;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            page-break-inside: avoid;
          }
          .usuario-nombre {
            font-size: 18px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 15px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            background-color: #0066cc;
            color: white;
            padding: 10px;
            text-align: left;
            font-weight: bold;
          }
          td {
            padding: 8px;
            border-bottom: 1px solid #e0e0e0;
          }
          tr:hover {
            background-color: #f9f9f9;
          }
          .pronostico {
            font-weight: bold;
            color: #0066cc;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #999;
            font-size: 12px;
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
                  
                  if (!p) {
                    return `
                      <tr>
                        <td>${partido.nombre_local} vs ${partido.nombre_visita}</td>
                        <td class="pronostico" style="color: #999;">Sin pronóstico</td>
                      </tr>
                    `;
                  }
                  
                  const pronostico = `${p.goles_local}-${p.goles_visita}`;
                  
                  return `
                    <tr>
                      <td>${p.nombre_local} vs ${p.nombre_visita}</td>
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

export default router;
