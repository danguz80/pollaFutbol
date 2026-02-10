import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getWhatsAppService } from '../services/whatsappService.js';
import htmlPdf from 'html-pdf-node';
import { getLogoBase64 } from '../utils/logoHelper.js';
import { getFotoPerfilBase64 } from '../utils/fotoPerfilHelper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/ganadores/titulos
router.get("/titulos", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM ganadores_jornada gj
      JOIN usuarios u ON gj.jugador_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el resumen de títulos" });
  }
});

// POST /api/ganadores/jornada/:numero/pdf-final - Generar PDF completo con resultados
router.post("/jornada/:numero/pdf-final", verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    
    console.log(`📄 Generando PDF Final para Jornada ${numero}...`);
    
    await generarPDFCompleto(numero);
    
    res.json({
      ok: true,
      mensaje: 'PDF generado y enviado exitosamente'
    });
  } catch (error) {
    console.error('Error generando PDF completo:', error);
    res.status(500).json({ error: 'Error generando PDF completo', details: error.message });
  }
});

//==================== FUNCIÓN PARA GENERAR PDF COMPLETO ====================
async function generarPDFCompleto(jornadaNumero) {
  try {
    // 1. Obtener pronósticos con resultados reales y puntos (INCLUIR TODOS aunque no haya resultados)
    const pronosticosQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        u.foto_perfil,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        pa.bonus,
        pa.id as partido_id,
        p.goles_local AS pred_local,
        p.goles_visita AS pred_visita,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        p.puntos,
        j.numero AS jornada_numero
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
        AND u.rol != 'admin'
      ORDER BY u.nombre, pa.fecha, pa.id`,
      [jornadaNumero]
    );

    // 2. Obtener ranking acumulado (excluyendo admins) - SIN LIMIT
    const rankingQuery = await pool.query(
      `SELECT 
        u.id,
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_total,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      LEFT JOIN jornadas j ON pa.jornada_id = j.id
      WHERE u.rol != 'admin'
        AND j.numero <= $1
        AND EXISTS (
          SELECT 1 FROM pronosticos p2
          JOIN partidos pa2 ON p2.partido_id = pa2.id
          JOIN jornadas j2 ON pa2.jornada_id = j2.id
          WHERE p2.usuario_id = u.id AND j2.numero <= $1
        )
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, u.nombre ASC`,
      [jornadaNumero]
    );

    // 3. Obtener ranking de la jornada específica (excluyendo admins) - SIN LIMIT
    const rankingJornadaQuery = await pool.query(
      `SELECT 
        u.id,
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntos_jornada,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      LEFT JOIN jornadas j ON pa.jornada_id = j.id
      WHERE u.rol != 'admin'
        AND j.numero = $1
        AND EXISTS (
          SELECT 1 FROM pronosticos p2
          JOIN partidos pa2 ON p2.partido_id = pa2.id
          JOIN jornadas j2 ON pa2.jornada_id = j2.id
          WHERE p2.usuario_id = u.id AND j2.numero = $1
        )
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntos_jornada DESC, u.nombre ASC`,
      [jornadaNumero]
    );

    // 4. Obtener ganadores de la jornada
    const ganadoresQuery = await pool.query(
      `SELECT u.nombre, u.foto_perfil, gj.puntaje
       FROM ganadores_jornada gj
       JOIN usuarios u ON gj.jugador_id = u.id
       JOIN jornadas j ON gj.jornada_id = j.id
       WHERE j.numero = $1
       ORDER BY gj.puntaje DESC`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    const ranking = rankingQuery.rows;
    const rankingJornada = rankingJornadaQuery.rows;
    const ganadores = ganadoresQuery.rows;

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {
          foto_perfil: p.foto_perfil,
          pronosticos: []
        };
      }
      pronosticosPorUsuario[p.usuario].pronosticos.push(p);
    });

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
          background: linear-gradient(135deg, #0066cc 0%, #00b4d8 100%);
          color: #333;
        }
        .header {
          text-align: center;
          background: white;
          padding: 10px;
          border-radius: 10px;
          margin-bottom: 15px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header h1 {
          color: #0066cc;
          font-size: 34px;
          margin: 15px 0 5px 0;
        }
        .header p {
          color: #666;
          font-size: 19px;
        }
        
        .ganadores-section {
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          padding: 15px;
          margin-bottom: 15px;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          text-align: center;
          page-break-inside: avoid;
        }
        .ganadores-section h2 {
          color: #0066cc;
          font-size: 32px;
          margin-bottom: 15px;
        }
        .ganador-card {
          display: inline-block;
          background: white;
          padding: 15px;
          margin: 10px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          vertical-align: top;
        }
        .ganador-foto {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #ffd700;
          margin-bottom: 10px;
        }
        .ganador-nombre {
          font-size: 24px;
          font-weight: bold;
          color: #0066cc;
          margin: 10px 0;
        }
        .ganador-puntos {
          font-size: 19px;
          color: #666;
        }

        .rankings-section {
          background: white;
          padding: 10px;
          margin-bottom: 12px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .rankings-section h2 {
          color: #0066cc;
          font-size: 27px;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .usuario-section {
          background: white;
          padding: 10px;
          margin-bottom: 12px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .usuario-header {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
          border-bottom: 3px solid #0066cc;
          padding-bottom: 6px;
        }
        .usuario-foto {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 15px;
          border: 2px solid #0066cc;
        }
        .usuario-info {
          flex-grow: 1;
        }
        .usuario-nombre {
          color: #0066cc;
          font-size: 24px;
          font-weight: bold;
          margin: 0;
        }
        .usuario-total {
          color: #0066cc;
          font-size: 22px;
          font-weight: bold;
          text-align: right;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #0066cc;
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
          background-color: #f5f5f5;
        }
        .partido-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .equipo-logo {
          width: 30px;
          height: 30px;
          object-fit: contain;
        }
        .vs {
          color: #999;
          font-weight: bold;
          margin: 0 4px;
        }
        .resultado {
          font-weight: bold;
          color: #0066cc;
          font-size: 22px;
        }
        .puntos-cell {
          font-weight: bold;
          font-size: 22px;
        }
        .puntos-positivo { color: #0066cc; }
        .puntos-cero { color: #c0392b; }
        
        .ranking-table th {
          background: #0066cc;
        }
        .ranking-table .posicion {
          text-align: center;
          font-weight: bold;
          font-size: 19px;
          color: #0066cc;
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
        .ranking-foto {
          width: 35px;
          height: 35px;
          border-radius: 50%;
          object-fit: cover;
          vertical-align: middle;
          margin-right: 10px;
          border: 2px solid #ddd;
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
        <h1>🏆 RESULTADOS TORNEO NACIONAL - JORNADA ${jornadaNumero}</h1>
        <p>Campeonato Nacional</p>
        <p style="font-size: 14px; color: #999; margin-top: 10px;">
          Fecha de generación: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
        </p>
      </div>
    `;

    // GANADORES DE LA JORNADA (o "Pendiente" si no hay)
    if (ganadores && ganadores.length > 0) {
      html += `
      <div class="ganadores-section">
        <h2>🏆 GANADOR${ganadores.length > 1 ? 'ES' : ''} DE LA JORNADA ${jornadaNumero}</h2>
      `;
      
      for (const ganador of ganadores) {
        const fotoBase64 = ganador.foto_perfil ? getFotoPerfilBase64(ganador.foto_perfil) : null;
        
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ganador-foto" alt="${ganador.nombre}">` 
          : `<div class="ganador-foto" style="background: #ddd; display: flex; align-items: center; justify-content: center;">👤</div>`;
        
        html += `
        <div class="ganador-card">
          ${fotoHTML}
          <div class="ganador-nombre">${ganador.nombre}</div>
          <div class="ganador-puntos">${ganador.puntaje} puntos</div>
        </div>
        `;
      }
      html += `</div>`;
    } else {
      // Mostrar "Ganador Pendiente" cuando no hay ganador
      html += `
      <div class="ganadores-section" style="background: linear-gradient(135deg, #f0f0f0, #e0e0e0);">
        <h2 style="color: #999;">⏳ GANADOR DE LA JORNADA ${jornadaNumero}</h2>
        <div class="ganador-card" style="background: #f9f9f9;">
          <div class="ganador-foto" style="background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 40px;">❓</div>
          <div class="ganador-nombre" style="color: #999;">PENDIENTE</div>
          <div class="ganador-puntos" style="color: #999;">Resultados aún no calculados</div>
        </div>
      </div>
      `;
    }

    // RANKING DE LA JORNADA
    if (rankingJornada.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>🥇 RANKING JORNADA ${jornadaNumero}</h2>
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

      rankingJornada.forEach((jugador, index) => {
        const fotoBase64 = jugador.foto_perfil ? getFotoPerfilBase64(jugador.foto_perfil) : null;
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ranking-foto" alt="${jugador.usuario}">` 
          : '';

        const posicionClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        
        html += `
            <tr class="${posicionClass}">
              <td class="posicion">${jugador.posicion}°</td>
              <td>${fotoHTML}${jugador.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${jugador.puntos_jornada}</td>
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
    if (ranking.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>📊 RANKING ACUMULADO (hasta jornada ${jornadaNumero})</h2>
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

      ranking.forEach((jugador, index) => {
        const fotoBase64 = jugador.foto_perfil ? getFotoPerfilBase64(jugador.foto_perfil) : null;
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ranking-foto" alt="${jugador.usuario}">` 
          : '';

        const posicionClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        
        html += `
            <tr class="${posicionClass}">
              <td class="posicion">${jugador.posicion}°</td>
              <td>${fotoHTML}${jugador.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${jugador.puntaje_total}</td>
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
    const usuariosOrdenados = Object.keys(pronosticosPorUsuario).sort();
    
    for (const usuario of usuariosOrdenados) {
      const data = pronosticosPorUsuario[usuario];
      const fotoBase64 = data.foto_perfil ? getFotoPerfilBase64(data.foto_perfil) : null;
      const fotoHTML = fotoBase64 
        ? `<img src="${fotoBase64}" class="usuario-foto" alt="${usuario}">` 
        : '';

      // Calcular puntaje total
      const puntosTotal = data.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);

      html += `
      <div class="usuario-section">
        <div class="usuario-header">
          ${fotoHTML}
          <div class="usuario-info">
            <h3 class="usuario-nombre">${usuario}</h3>
          </div>
          <div class="usuario-total">
            Total: ${puntosTotal} pts
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35%;">Partido</th>
              <th style="width: 15%; text-align: center;">Mi Pronóstico</th>
              <th style="width: 15%; text-align: center;">Resultado Real</th>
              <th style="width: 10%; text-align: center;">Bonus</th>
              <th style="width: 10%; text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const p of data.pronosticos) {
        const logoLocal = await getLogoBase64(p.nombre_local);
        const logoVisita = await getLogoBase64(p.nombre_visita);

        const logoLocalHTML = logoLocal 
          ? `<img src="${logoLocal}" class="equipo-logo" alt="${p.nombre_local}">` 
          : '';
        const logoVisitaHTML = logoVisita 
          ? `<img src="${logoVisita}" class="equipo-logo" alt="${p.nombre_visita}">` 
          : '';

        const puntosClass = (p.puntos || 0) > 0 ? 'puntos-positivo' : 'puntos-cero';

        html += `
            <tr>
              <td>
                <div class="partido-cell">
                  ${logoLocalHTML}
                  <span>${p.nombre_local}</span>
                  <span class="vs">vs</span>
                  <span>${p.nombre_visita}</span>
                  ${logoVisitaHTML}
                </div>
              </td>
              <td style="text-align: center;">
                <span class="resultado">${p.pred_local} - ${p.pred_visita}</span>
              </td>
              <td style="text-align: center;">
                <span class="resultado">${p.real_local} - ${p.real_visita}</span>
              </td>
              <td style="text-align: center;">
                x${p.bonus}
              </td>
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">
                ${p.puntos || 0}
              </td>
            </tr>
        `;
      }

      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    html += `
      <div class="footer">
        Generado el ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
      </div>
    </body>
    </html>
    `;

    // Generar PDF
    console.log('📄 Generando PDF...');
    const file = { content: html };
    const options = {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    };

    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log('✅ PDF generado exitosamente');

    // Enviar PDF por email
    const whatsappService = getWhatsAppService();
    const nombreArchivo = `TorneoNacional_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;

    const resultado = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      `Resultados Torneo Nacional - Jornada ${jornadaNumero}`,
      `Adjunto encontrarás los resultados completos de la jornada ${jornadaNumero} del Torneo Nacional con pronósticos, rankings y ganadores.`
    );

    if (resultado.success) {
      console.log('✅ PDF enviado por email exitosamente');
    } else {
      console.error('❌ Error al enviar PDF por email:', resultado.error);
    }

    return true;
  } catch (error) {
    console.error('Error en generarPDFCompleto:', error);
    throw error;
  }
}

export { generarPDFCompleto };
export default router;
