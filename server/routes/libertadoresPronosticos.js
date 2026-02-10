import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';
import { getLogoBase64 } from '../utils/logoHelper.js';
import { getFotoPerfilBase64 } from '../utils/fotoPerfilHelper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosLibertadores.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Guardar pronóstico de final VIRTUAL (J10)
router.post('/final-virtual', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si el usuario está activo en Libertadores
    const usuarioCheck = await pool.query(
      'SELECT activo_libertadores FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_libertadores !== true) {
      console.log('🚫 Usuario sin acceso a Libertadores (final-virtual):', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en la Copa Libertadores' });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada, numero FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    if (jornadaCheck.rows[0].numero !== 10) {
      return res.status(400).json({ error: 'Este endpoint es solo para la jornada 10' });
    }

    // Guardar pronóstico de final virtual
    await pool.query(`
      INSERT INTO libertadores_pronosticos_final_virtual 
      (usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (usuario_id, jornada_id)
      DO UPDATE SET 
        equipo_local = EXCLUDED.equipo_local,
        equipo_visita = EXCLUDED.equipo_visita,
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    // Determinar ganador para predicción de campeón/subcampeón
    let campeon = null;
    let subcampeon = null;
    
    if (goles_local > goles_visita) {
      campeon = equipo_local;
      subcampeon = equipo_visita;
    } else if (goles_local < goles_visita) {
      campeon = equipo_visita;
      subcampeon = equipo_local;
    } else if (penales_local !== null && penales_visita !== null) {
      if (penales_local > penales_visita) {
        campeon = equipo_local;
        subcampeon = equipo_visita;
      } else if (penales_local < penales_visita) {
        campeon = equipo_visita;
        subcampeon = equipo_local;
      }
    }
    
    // Guardar predicción de campeón/subcampeón
    if (campeon && subcampeon) {
      await pool.query(
        `INSERT INTO libertadores_predicciones_campeon (usuario_id, campeon, subcampeon)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id)
         DO UPDATE SET campeon = EXCLUDED.campeon, subcampeon = EXCLUDED.subcampeon, updated_at = CURRENT_TIMESTAMP`,
        [usuario_id, campeon, subcampeon]
      );
    }

    res.json({ 
      mensaje: 'Pronóstico de final virtual guardado exitosamente',
      prediccion_campeon: campeon && subcampeon ? { campeon, subcampeon } : null
    });
  } catch (error) {
    console.error('Error guardando pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Guardar/Actualizar pronóstico
router.post('/', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si el usuario está activo en Libertadores
    const usuarioCheck = await pool.query(
      'SELECT activo_libertadores FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_libertadores !== true) {
      console.log('🚫 Usuario sin acceso a Libertadores:', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en la Copa Libertadores' });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    // Insertar o actualizar pronóstico (incluyendo penales)
    await pool.query(`
      INSERT INTO libertadores_pronosticos 
      (usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (usuario_id, partido_id, jornada_id)
      DO UPDATE SET 
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    res.json({ mensaje: 'Pronóstico guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Obtener pronósticos de un usuario para una jornada
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT p.*
      FROM libertadores_pronosticos p
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
    `, [usuario_id, numero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// Obtener pronóstico de final virtual (J10)
router.get('/final-virtual/:jornada_id', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM libertadores_pronosticos_final_virtual
      WHERE usuario_id = $1 AND jornada_id = $2
    `, [usuario_id, jornada_id]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error obteniendo pronóstico' });
  }
});

// Calcular puntajes de una jornada
router.post('/calcular/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const pronosticos = await pool.query(`
      SELECT p.id, p.usuario_id, p.goles_local, p.goles_visita,
             pa.goles_local AS real_local, pa.goles_visita AS real_visita,
             pa.bonus
      FROM libertadores_pronosticos p
      JOIN libertadores_partidos pa ON p.partido_id = pa.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
    `, [numero]);

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      if (p.real_local === null || p.real_visita === null) {
        continue; // Saltar partidos sin resultado
      }

      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = p.real_local - p.real_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === p.real_local && p.goles_visita === p.real_visita) {
        puntosBase = 5; // Resultado exacto
      } else if (pred_dif === real_dif) {
        puntosBase = 3; // Diferencia exacta
      } else if (pred_signo === real_signo && real_signo !== 0) {
        puntosBase = 1; // Solo el signo
      }

      const puntos = puntosBase * (p.bonus || 1);

      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({ mensaje: 'Puntajes calculados', actualizados });
  } catch (error) {
    console.error('Error calculando puntajes:', error);
    res.status(500).json({ error: 'Error calculando puntajes' });
  }
});

// Ranking general
router.get('/ranking', async (req, res) => {
  try {
    // Obtener puntos de pronósticos
    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_pronosticos
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN libertadores_usuarios_activos lua ON lua.usuario_id = u.id
      WHERE lua.activo = true OR lua.usuario_id IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY u.nombre
    `);
    
    // Para cada usuario, obtener puntos de clasificados
    const jornadasNumeros = [1, 2, 3, 4, 5, 6];
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    // Calcular clasificados oficiales una sola vez
    const clasificadosOficiales = [];
    for (const grupo of grupos) {
      const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
      if (tabla.length >= 2) {
        clasificadosOficiales.push(tabla[0].nombre);
        clasificadosOficiales.push(tabla[1].nombre);
      }
    }
    
    // Para cada usuario, calcular puntos de clasificados
    const ranking = await Promise.all(result.rows.map(async (usuario) => {
      let puntosClasificados = 0;
      
      for (const grupo of grupos) {
        try {
          const tablaUsuario = await calcularTablaUsuario(usuario.id, grupo, jornadasNumeros);
          
          if (tablaUsuario.length >= 2) {
            const equiposUsuario = [tablaUsuario[0].nombre, tablaUsuario[1].nombre];
            equiposUsuario.forEach(equipo => {
              if (clasificadosOficiales.includes(equipo)) {
                puntosClasificados += 2;
              }
            });
          }
        } catch (error) {
          // Si hay error en un grupo, continuar con los demás
          console.error(`Error calculando grupo ${grupo} para usuario ${usuario.id}:`, error.message);
        }
      }
      
      return {
        ...usuario,
        puntaje_clasificados: puntosClasificados,
        puntaje_total: parseInt(usuario.puntaje_pronosticos) + puntosClasificados
      };
    }));
    
    // Ordenar por puntaje total
    ranking.sort((a, b) => {
      if (b.puntaje_total !== a.puntaje_total) return b.puntaje_total - a.puntaje_total;
      return a.nombre.localeCompare(b.nombre);
    });

    res.json(ranking);
  } catch (error) {
    console.error('Error obteniendo ranking:', error);
    res.status(500).json({ error: 'Error obteniendo ranking' });
  }
});

// Ranking de una jornada
router.get('/ranking/jornada/:numero', async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_jornada
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN libertadores_jornadas j ON p.jornada_id = j.id AND j.numero = $1
      LEFT JOIN libertadores_usuarios_activos lua ON lua.usuario_id = u.id
      WHERE (lua.activo = true OR lua.usuario_id IS NULL)
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY u.nombre
    `, [numero]);
    
    // Si es jornada 6, agregar puntos de clasificados
    if (parseInt(numero) === 6) {
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      
      // Calcular clasificados oficiales
      const clasificadosOficiales = [];
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        if (tabla.length >= 2) {
          clasificadosOficiales.push(tabla[0].nombre);
          clasificadosOficiales.push(tabla[1].nombre);
        }
      }
      
      // Para cada usuario, calcular puntos de clasificados
      const ranking = await Promise.all(result.rows.map(async (usuario) => {
        let puntosClasificados = 0;
        
        for (const grupo of grupos) {
          try {
            const tablaUsuario = await calcularTablaUsuario(usuario.id, grupo, jornadasNumeros);
            
            if (tablaUsuario.length >= 2) {
              const equiposUsuario = [tablaUsuario[0].nombre, tablaUsuario[1].nombre];
              equiposUsuario.forEach(equipo => {
                if (clasificadosOficiales.includes(equipo)) {
                  puntosClasificados += 2;
                }
              });
            }
          } catch (error) {
            console.error(`Error calculando grupo ${grupo} para usuario ${usuario.id}:`, error.message);
          }
        }
        
        return {
          ...usuario,
          puntaje_clasificados: puntosClasificados,
          puntaje_jornada: parseInt(usuario.puntaje_jornada) + puntosClasificados
        };
      }));
      
      // Ordenar por puntaje total
      ranking.sort((a, b) => {
        if (b.puntaje_jornada !== a.puntaje_jornada) return b.puntaje_jornada - a.puntaje_jornada;
        return a.nombre.localeCompare(b.nombre);
      });
      
      return res.json(ranking);
    }

    // Para otras jornadas, ordenar normalmente
    result.rows.sort((a, b) => {
      if (b.puntaje_jornada !== a.puntaje_jornada) return b.puntaje_jornada - a.puntaje_jornada;
      return a.nombre.localeCompare(b.nombre);
    });
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// Borrar todos los pronósticos de un usuario para una jornada específica
router.delete('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT id, cerrada FROM libertadores_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'No puedes borrar pronósticos de una jornada cerrada' });
    }

    const jornadaId = jornadaCheck.rows[0].id;

    // Borrar todos los pronósticos del usuario para esta jornada
    const result = await pool.query(
      'DELETE FROM libertadores_pronosticos WHERE usuario_id = $1 AND jornada_id = $2',
      [usuario_id, jornadaId]
    );

    res.json({ 
      mensaje: 'Pronósticos borrados exitosamente',
      cantidad: result.rowCount
    });
  } catch (error) {
    console.error('Error borrando pronósticos:', error);
    res.status(500).json({ error: 'Error borrando pronósticos' });
  }
});

// Generar PDF con pronósticos de una jornada y enviarlo por email
router.post('/generar-pdf/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    console.log(`📄 Generando PDF para jornada Libertadores ${numero}...`);

    // Obtener todos los pronósticos de la jornada
    const pronosticosResult = await pool.query(`
      SELECT 
        u.nombre as usuario,
        u.foto_perfil,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        p.penales_local,
        p.penales_visita,
        pa.goles_local as real_local,
        pa.goles_visita as real_visita,
        p.puntos
      FROM libertadores_pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN libertadores_partidos pa ON p.partido_id = pa.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.nombre, pa.fecha
    `, [numero]);

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

    // Agrupar pronósticos por usuario con foto de perfil
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {
          foto_perfil: p.foto_perfil,
          pronosticos: {}
        };
      }
      const key = `${p.nombre_local}|${p.nombre_visita}`;
      pronosticosPorUsuario[p.usuario].pronosticos[key] = p;
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
          .usuario-header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 6px;
          }
          .usuario-foto {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #0066cc;
          }
          .usuario-nombre {
            font-size: 22px;
            font-weight: bold;
            color: #0066cc;
            flex: 1;
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
            width: 20px;
            height: 20px;
            object-fit: contain;
          }
          .vs {
            color: #999;
            font-weight: normal;
            margin: 0 4px;
          }
          .pronostico {
            font-weight: bold;
            color: #0066cc;
            font-size: 22px;
          }
          .resultado {
            color: #28a745;
            font-weight: bold;
          }
          .puntos {
            font-weight: bold;
            color: #ff6600;
            text-align: center;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #999;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
            padding-top: 20px;
          }
          .penales {
            font-size: 10px;
            color: #666;
            font-style: italic;
          }
          .equipo-logo {
            width: 30px;
            height: 30px;
            object-fit: contain;
            vertical-align: middle;
            margin-right: 8px;
          }
          .partido-info {
            display: inline-flex;
            align-items: center;
            gap: 8px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏆 Pronósticos Copa Libertadores</h1>
          <p>Jornada ${numero}</p>
          <p><strong>Documento Testigo - Pronósticos Registrados</strong></p>
          <p>Fecha de generación: ${new Date().toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>

        ${Object.keys(pronosticosPorUsuario).sort().map(usuario => {
          const userData = pronosticosPorUsuario[usuario];
          const fotoBase64 = userData.foto_perfil ? getFotoPerfilBase64(userData.foto_perfil) : null;
          const fotoHTML = fotoBase64 
            ? `<img src="${fotoBase64}" class="usuario-foto" alt="${usuario}">` 
            : '';
          
          return `
          <div class="usuario-section">
            <div class="usuario-header">
              ${fotoHTML}
              <div class="usuario-nombre">👤 ${usuario}</div>
            </div>
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
                  const p = userData.pronosticos[key];
                  
                  // Obtener logos
                  const logoLocal = getLogoBase64(partido.nombre_local) || '';
                  const logoVisita = getLogoBase64(partido.nombre_visita) || '';
                  
                  if (!p) {
                    return `
                      <tr>
                        <td>
                          <div class="partido-info">
                            ${logoLocal ? `<img src="${logoLocal}" class="equipo-logo" alt="${partido.nombre_local}">` : ''}
                            <span>${partido.nombre_local}</span>
                            <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                            ${logoVisita ? `<img src="${logoVisita}" class="equipo-logo" alt="${partido.nombre_visita}">` : ''}
                            <span>${partido.nombre_visita}</span>
                          </div>
                        </td>
                        <td class="pronostico" style="color: #999;">Sin pronóstico</td>
                      </tr>
                    `;
                  }
                  
                  const pronostico = `${p.goles_local}-${p.goles_visita}`;
                  const penales = (p.penales_local !== null && p.penales_visita !== null) 
                    ? ` (${p.penales_local}-${p.penales_visita} pen.)` 
                    : '';
                  
                  return `
                    <tr>
                      <td>
                        <div class="partido-info">
                          ${logoLocal ? `<img src="${logoLocal}" class="equipo-logo" alt="${p.nombre_local}">` : ''}
                          <span>${p.nombre_local}</span>
                          <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                          ${logoVisita ? `<img src="${logoVisita}" class="equipo-logo" alt="${p.nombre_visita}">` : ''}
                          <span>${p.nombre_visita}</span>
                        </div>
                      </td>
                      <td class="pronostico">${pronostico}${penales}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          `;
        }).join('')}

        <div class="footer">
          <p>Campeonato Polla Fútbol - Copa Libertadores</p>
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
    const nombreArchivo = `Libertadores_Jornada_${numero}_${new Date().toISOString().split('T')[0]}.pdf`;
    const whatsappService = getWhatsAppService();
    const resultado = await whatsappService.enviarEmailConPDF(
      pdfBuffer, 
      nombreArchivo, 
      numero,
      'Copa Libertadores'
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
