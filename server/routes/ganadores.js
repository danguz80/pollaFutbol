import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { generarPdfFinalBuffer } from '../utils/pdfFinal.js';

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
    
    const pdfBuffer = await generarPDFCompleto(numero);
    const nombreArchivo = `TorneoNacional_Jornada_${numero}_${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
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
        pronosticosPorUsuario[p.usuario] = [];
      }
      pronosticosPorUsuario[p.usuario].push(p);
    });

    // Armar los datos por usuario para el PDF (sin logos ni fotos: pdfkit no
    // los dibuja en este sistema, ver utils/pdfFinal.js)
    const usuariosOrdenados = Object.keys(pronosticosPorUsuario).sort();
    const usuariosPdf = usuariosOrdenados.map((usuario) => {
      const filas = pronosticosPorUsuario[usuario];
      const puntosTotal = filas.reduce((sum, p) => sum + (p.puntos || 0), 0);
      return {
        nombre: usuario,
        resumenPuntos: `Total: ${puntosTotal} pts`,
        filasPartidos: filas.map(p => [
          p.jornada_numero,
          `${p.nombre_local} vs ${p.nombre_visita}`,
          `${p.pred_local}-${p.pred_visita}`,
          `${p.real_local}-${p.real_visita}`,
          `x${p.bonus}`,
          p.puntos || 0
        ])
      };
    });

    const pdfBuffer = await generarPdfFinalBuffer({
      competencia: 'Torneo Nacional',
      jornadaNumero,
      ganadores,
      rankingJornada,
      ranking,
      usuarios: usuariosPdf
    });

    return pdfBuffer;
  } catch (error) {
    console.error('Error en generarPDFCompleto:', error);
    throw error;
  }
}

export { generarPDFCompleto };
export default router;
