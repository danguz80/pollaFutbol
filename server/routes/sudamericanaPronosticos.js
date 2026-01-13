import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { getWhatsAppService } from '../services/whatsappService.js';
import htmlPdf from 'html-pdf-node';
import { getLogoBase64 } from '../utils/logoHelper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET - Obtener pronósticos de un usuario para una jornada específica
router.get('/jornada/:jornadaNumero/usuario/:usuarioId', verifyToken, async (req, res) => {
  try {
    const { jornadaNumero, usuarioId } = req.params;

    const result = await pool.query(`
      SELECT 
        p.id,
        p.partido_id,
        p.goles_local,
        p.goles_visita,
        p.penales_local,
        p.penales_visita,
        p.puntos
      FROM sudamericana_pronosticos p
      INNER JOIN sudamericana_partidos pa ON pa.id = p.partido_id
      INNER JOIN sudamericana_jornadas j ON j.id = pa.jornada_id
      WHERE p.usuario_id = $1 AND j.numero = $2
    `, [usuarioId, jornadaNumero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// POST - Guardar un pronóstico individual
router.post('/', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si el usuario está activo en Sudamericana
    const usuarioCheck = await pool.query(
      'SELECT activo_sudamericana FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_sudamericana !== true) {
      console.log('🚫 Usuario sin acceso a Sudamericana:', usuario_id);
      return res.status(403).json({ 
        error: '❌ No puedes guardar pronósticos porque no estás activo en la Copa Sudamericana. Contacta al administrador para activar tu acceso.' 
      });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada FROM sudamericana_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    // Verificar si ya existe el pronóstico
    const existeResult = await pool.query(
      'SELECT id FROM sudamericana_pronosticos WHERE usuario_id = $1 AND partido_id = $2',
      [usuario_id, partido_id]
    );

    if (existeResult.rows.length > 0) {
      // Actualizar
      await pool.query(
        `UPDATE sudamericana_pronosticos 
         SET goles_local = $1, goles_visita = $2, penales_local = $3, penales_visita = $4
         WHERE usuario_id = $5 AND partido_id = $6`,
        [goles_local, goles_visita, penales_local, penales_visita, usuario_id, partido_id]
      );
    } else {
      // Insertar
      await pool.query(
        `INSERT INTO sudamericana_pronosticos 
         (usuario_id, partido_id, goles_local, goles_visita, penales_local, penales_visita, puntos)
         VALUES ($1, $2, $3, $4, $5, $6, 0)`,
        [usuario_id, partido_id, goles_local, goles_visita, penales_local, penales_visita]
      );
    }

    res.json({ mensaje: 'Pronóstico guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// POST - Guardar pronósticos de un usuario para una jornada
router.post('/guardar', verifyToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { usuario_id, jornada_numero, pronosticos } = req.body;

    if (!usuario_id || !jornada_numero || !Array.isArray(pronosticos)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Verificar si el usuario está activo en Sudamericana
    const usuarioCheck = await client.query(
      'SELECT activo_sudamericana FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_sudamericana !== true) {
      console.log('🚫 Usuario sin acceso a Sudamericana:', usuario_id);
      return res.status(403).json({ 
        error: '❌ No puedes guardar pronósticos porque no estás activo en la Copa Sudamericana. Contacta al administrador para activar tu acceso.' 
      });
    }

    await client.query('BEGIN');

    // Obtener el ID de la jornada
    const jornadaResult = await client.query(
      'SELECT id, cerrada FROM sudamericana_jornadas WHERE numero = $1',
      [jornada_numero]
    );

    if (jornadaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const { id: jornada_id, cerrada } = jornadaResult.rows[0];

    if (cerrada) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La jornada está cerrada' });
    }

    // Guardar/actualizar cada pronóstico
    for (const pronostico of pronosticos) {
      const { partido_id, goles_local, goles_visita, penales_local, penales_visita } = pronostico;

      if (!partido_id) continue;

      // Verificar si ya existe un pronóstico
      const existeResult = await client.query(
        'SELECT id FROM sudamericana_pronosticos WHERE usuario_id = $1 AND partido_id = $2',
        [usuario_id, partido_id]
      );

      if (existeResult.rows.length > 0) {
        // Actualizar
        await client.query(
          `UPDATE sudamericana_pronosticos 
           SET goles_local = $1, goles_visita = $2, penales_local = $3, penales_visita = $4
           WHERE usuario_id = $5 AND partido_id = $6`,
          [goles_local, goles_visita, penales_local, penales_visita, usuario_id, partido_id]
        );
      } else {
        // Insertar
        await client.query(
          `INSERT INTO sudamericana_pronosticos 
           (usuario_id, partido_id, goles_local, goles_visita, penales_local, penales_visita, puntos)
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [usuario_id, partido_id, goles_local, goles_visita, penales_local, penales_visita]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ mensaje: 'Pronósticos guardados exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando pronósticos:', error);
    res.status(500).json({ error: 'Error guardando pronósticos' });
  } finally {
    client.release();
  }
});

// Generar PDF con pronósticos de una jornada y enviarlo por email
router.post('/generar-pdf/:jornadaNumero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.params;

    console.log(`📄 Generando PDF para jornada Sudamericana ${jornadaNumero}...`);

    // Obtener información de la jornada por número
    const jornadaInfo = await pool.query(
      'SELECT id, numero, nombre FROM sudamericana_jornadas WHERE numero = $1',
      [jornadaNumero]
    );

    if (jornadaInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }
    
    const jornadaId = jornadaInfo.rows[0].id;

    const { numero, nombre } = jornadaInfo.rows[0];

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
        pa.goles_local as real_local,
        pa.goles_visita as real_visita,
        p.puntos
      FROM sudamericana_pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN sudamericana_partidos pa ON p.partido_id = pa.id
      WHERE pa.jornada_id = $1
      ORDER BY u.nombre, pa.fecha
    `, [jornadaId]);

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

    // Función para convertir foto de perfil a base64
    const getFotoPerfilBase64 = (fotoPerfil) => {
      if (!fotoPerfil) return null;
      try {
        // Limpiar el path: si empieza con /perfil/, quitarlo
        let cleanPath = fotoPerfil;
        if (cleanPath.startsWith('/perfil/')) {
          cleanPath = cleanPath.substring(8);
        } else if (cleanPath.startsWith('perfil/')) {
          cleanPath = cleanPath.substring(7);
        }
        
        const fotoPath = path.join(__dirname, '../../client/public/perfil', cleanPath);
        
        if (fs.existsSync(fotoPath)) {
          const imageBuffer = fs.readFileSync(fotoPath);
          const ext = path.extname(cleanPath).substring(1);
          return `data:image/${ext};base64,${imageBuffer.toString('base64')}`;
        }
      } catch (error) {
        console.warn(`⚠️  Error cargando foto: ${fotoPerfil}`, error.message);
      }
      return null;
    };

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
          .pronostico {
            font-weight: bold;
            color: #0066cc;
            font-size: 22px;
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
          <h1>🏆 Pronósticos Copa Sudamericana</h1>
          <p>${nombre} (Jornada ${numero})</p>
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
                      <td class="pronostico">${pronostico}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          `;
        }).join('')}

        <div class="footer">
          <p>Campeonato Polla Fútbol - Copa Sudamericana</p>
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
    const nombreArchivo = `Sudamericana_Jornada_${numero}_${new Date().toISOString().split('T')[0]}.pdf`;
    const whatsappService = getWhatsAppService();
    const resultado = await whatsappService.enviarEmailConPDF(
      pdfBuffer, 
      nombreArchivo, 
      numero,
      'Copa Sudamericana'
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
