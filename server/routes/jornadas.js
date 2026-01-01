import express from "express";
import { pool } from "../db/pool.js";
// COMENTADO - FASE 2: Moviendo código Sudamericana a archivos especializados
// import { importarFixtureSudamericana } from '../services/importarSudamericana.js';
// import { definirClasificadosPlayoffs } from '../services/clasificacionSudamericana.js';
import ganadoresRouter from "./ganadores.js";
// COMENTADO - FASE 2: Moviendo código Sudamericana a archivos especializados  
// import pronosticosSudamericanaRouter from "./pronosticosSudamericana.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { getWhatsAppService } from "../services/whatsappService.js";
import htmlPdf from 'html-pdf-node';
import { getLogoBase64 } from '../utils/logoHelper.js';
// COMENTADO - FASE 2: Moviendo código Sudamericana a archivos especializados
// import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// COMENTADO - FASE 2: Función helper movida a archivos especializados de Sudamericana
// // Función helper para obtener clasificados reales basándose en los fixtures oficiales
// async function obtenerClasificadosReales() {
//   // Obtener todos los fixtures con sus datos reales
//   const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
//   
//   // Construir diccionario basándose en los campos 'clasificado' y 'equipo_clasificado_real'
//   const dic = {};
//   
//   for (const fixture of fixturesResult.rows) {
//     const { clasificado, equipo_clasificado_real } = fixture;
//     
//     // Si hay un clasificado definido, mapear la sigla al equipo real
//     if (clasificado && equipo_clasificado_real) {
//       // Mapear la sigla (WP01, WO.A, etc.) al nombre real del equipo
//       dic[clasificado] = equipo_clasificado_real;
//     }
//   }
//   
//   return dic;
// }

// COMENTADO - FASE 2: Endpoint movido a archivos especializados de Sudamericana
// // 🔹 Obtener todas las jornadas de la Sudamericana (para admin panel Sudamericana)
// router.get("/sudamericana", async (req, res) => {
//   try {
//     // Si tienes una tabla sudamericana_jornadas, usa esa. Si no, retorna un array dummy con una sola jornada para que el panel funcione.
//     // Ejemplo con una sola jornada global:
//     // const { rows } = await pool.query("SELECT id, numero, cerrada FROM sudamericana_jornadas ORDER BY numero ASC");
//     // res.json(rows);
//     res.json([{ id: 1, numero: 1, cerrada: false }]);
//   } catch (err) {
//     console.error("Error al obtener jornadas Sudamericana:", err);
//     // Devuelve un array dummy para que el frontend no falle
//     res.json([{ id: 1, numero: 1, cerrada: false }]);
//   }
// });

// 🔹 Obtener todas las jornadas
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, numero, ganadores, cerrada FROM jornadas ORDER BY numero ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener jornadas:", err);
    res.status(500).json({ error: "Error al obtener jornadas" });
  }
});

// 🔹 PATCH /api/jornadas/proxima/fecha-cierre (antes de rutas dinámicas)
router.patch("/proxima/fecha-cierre", async (req, res) => {
  const { fecha_cierre } = req.body;
  if (!fecha_cierre) {
    return res.status(400).json({ error: "Se requiere fecha_cierre" });
  }
  try {
    // Busca la próxima jornada abierta (no cerrada, menor número)
    const result = await pool.query(
      "SELECT id FROM jornadas WHERE cerrada = false ORDER BY numero ASC LIMIT 1"
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No hay jornadas abiertas" });
    }
    const jornadaId = result.rows[0].id;
    await pool.query(
      "UPDATE jornadas SET fecha_cierre = $1 WHERE id = $2",
      [fecha_cierre, jornadaId]
    );
    res.json({ ok: true, message: "Fecha de cierre actualizada", jornadaId });
  } catch (err) {
    console.error("Error al actualizar fecha de cierre:", err);
    res.status(500).json({ error: "Error al actualizar fecha de cierre" });
  }
});

// 🔹 PATCH /api/jornadas/:id/fecha-cierre - Actualizar fecha de cierre de una jornada específica
router.patch("/:id/fecha-cierre", verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { fecha_cierre } = req.body;
  
  if (!fecha_cierre) {
    return res.status(400).json({ error: "Se requiere fecha_cierre" });
  }
  
  try {
    const result = await pool.query(
      "UPDATE jornadas SET fecha_cierre = $1 WHERE id = $2 RETURNING id, numero, fecha_cierre",
      [fecha_cierre, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    
    res.json({ ok: true, message: "Fecha de cierre actualizada", jornada: result.rows[0] });
  } catch (err) {
    console.error("Error al actualizar fecha de cierre:", err);
    res.status(500).json({ error: "Error al actualizar fecha de cierre" });
  }
});

// 🔹 GET /api/jornadas/proxima-abierta (antes de rutas dinámicas)
router.get("/proxima-abierta", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, numero, fecha_cierre FROM jornadas WHERE cerrada = false ORDER BY numero ASC LIMIT 1"
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No hay jornadas abiertas" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al obtener próxima jornada abierta:", err);
    res.status(500).json({ error: "Error al obtener próxima jornada abierta" });
  }
});

// 🔹 Obtener una jornada específica con su estado (cerrada)
router.get("/:numero", async (req, res) => {
  const { numero } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, numero, cerrada, fecha_cierre FROM jornadas WHERE numero = $1",
      [numero]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener jornada:", error);
    res.status(500).json({ error: "Error al obtener jornada" });
  }
});

// 🔹 Obtener partidos de una jornada específica
router.get("/:numero/partidos", async (req, res) => {
  const { numero } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.nombre_local AS local, p.nombre_visita AS visita,
        p.fecha, p.status, p.goles_local, p.goles_visita, p.bonus,
        j.numero AS jornada
      FROM partidos p
      JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY p.fecha;
      `,
      [numero]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener partidos de la jornada:", error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/jornadas/:numero/resultados → obtiene resultados reales y los guarda
router.patch("/:numero/resultados", async (req, res) => {
  const { numero } = req.params;
  try {
    // 1. Obtener partidos de esa jornada desde tu base de datos
    const partidos = await pool.query(
      `SELECT p.id
       FROM partidos p
       JOIN jornadas j ON p.jornada_id = j.id
       WHERE j.numero = $1`,
      [numero]
    );
    if (partidos.rowCount === 0) {
      return res.status(404).json({ error: "No hay partidos para esta jornada" });
    }

    let actualizados = 0;
    // 2. Por cada partido, consultar la API y actualizar
    for (const p of partidos.rows) {
      const fixtureId = p.id;
      const response = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?id=${fixtureId}`, {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com"
        }
      });
      const data = await response.json();
      const fixture = data.response[0];
      if (!fixture || fixture.goals.home === null || fixture.goals.away === null) continue;
      // 3. Actualizar en base de datos
      await pool.query(
        `UPDATE partidos
         SET goles_local = $1, goles_visita = $2, status = $3
         WHERE id = $4`,
        [fixture.goals.home, fixture.goals.away, fixture.fixture.status.short, fixtureId]
      );
      actualizados++;
    }
    res.json({
      mensaje: "Resultados actualizados desde API",
      actualizados,
      total: partidos.rowCount
    });
  } catch (err) {
    console.error("Error al actualizar resultados:", err);
    res.status(500).json({ error: "No se pudieron actualizar los resultados" });
  }
});

// PATCH /api/jornadas/:numero/partidos
router.patch("/:numero/partidos", async (req, res) => {
  const { numero } = req.params;
  const { partidos } = req.body;
  if (!Array.isArray(partidos) || partidos.length === 0) {
    return res.status(400).json({ error: "No se recibieron partidos para actualizar" });
  }
  let actualizados = 0;
  try {
    for (const partido of partidos) {
      // Actualizar goles y bonus
      await pool.query(
        `UPDATE partidos
         SET goles_local = $1, goles_visita = $2, bonus = $3
         WHERE id = $4`,
        [
          partido.golesLocal !== "" ? partido.golesLocal : null,
          partido.golesVisita !== "" ? partido.golesVisita : null,
          partido.bonus ?? 1,
          partido.id
        ]
      );
      actualizados++;
    }
    res.json({ mensaje: "Resultados y bonus guardados en la base de datos", actualizados });
  } catch (error) {
    console.error("Error al actualizar partidos:", error);
    res.status(500).json({ error: "Error al actualizar partidos" });
  }
});

// Función auxiliar para generar PDF de pronósticos
async function generarPDFPronosticos(numeroJornada) {
  try {
    console.log(`📄 Generando PDF para jornada ${numeroJornada}...`);

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
      WHERE j.numero = $1 AND u.activo_torneo_nacional = true
      ORDER BY u.nombre, pa.fecha
    `, [numeroJornada]);

    if (pronosticosResult.rows.length === 0) {
      console.log(`⚠️ No hay pronósticos para la jornada ${numeroJornada}`);
      return null;
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
            font-size: 34px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
            font-size: 19px;
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
            font-size: 22px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 15px;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 15px;
          }
          th {
            background-color: #0066cc;
            color: white;
            padding: 12px;
            text-align: left;
            font-size: 18px;
            font-weight: bold;
          }
          td {
            padding: 10px;
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
            font-size: 18px;
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
          <p>Jornada ${numeroJornada}</p>
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
                            ${logoLocal ? `<img src="${logoLocal}" style="width: 30px; height: 30px; object-fit: contain; margin-right: 8px;">` : ''}
                            <span>${partido.nombre_local}</span>
                            <span style="margin: 0 10px; color: #999; font-weight: bold;">vs</span>
                            ${logoVisita ? `<img src="${logoVisita}" style="width: 30px; height: 30px; object-fit: contain; margin-right: 8px;">` : ''}
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
                          ${logoLocal ? `<img src="${logoLocal}" style="width: 30px; height: 30px; object-fit: contain; margin-right: 8px;">` : ''}
                          <span>${p.nombre_local}</span>
                          <span style="margin: 0 10px; color: #999; font-weight: bold;">vs</span>
                          ${logoVisita ? `<img src="${logoVisita}" style="width: 30px; height: 30px; object-fit: contain; margin-right: 8px;">` : ''}
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
    return pdfBuffer;

  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    return null;
  }
}

// PATCH /api/jornadas/:id/cerrar → cambia el estado 'cerrada'
router.patch("/:id/cerrar", async (req, res) => {
  const { id } = req.params;
  const { cerrada } = req.body; // true o false
  try {
    const result = await pool.query(
      "UPDATE jornadas SET cerrada = $1 WHERE id = $2 RETURNING id, numero, cerrada",
      [cerrada, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    
    const jornada = result.rows[0];
    
    // Si se está cerrando la jornada (cerrada = true), generar PDF y enviar por email
    if (cerrada === true) {
      try {
        const whatsappService = getWhatsAppService();
        
        // Generar y enviar PDF en modo no bloqueante
        setTimeout(async () => {
          try {
            console.log(`📄 Generando y enviando PDF para jornada ${jornada.numero}...`);
            
            // Generar el PDF
            const pdfBuffer = await generarPDFPronosticos(jornada.numero);
            
            if (pdfBuffer) {
              // Enviar PDF por email
              const nombreArchivo = `TorneoNacional_Jornada_${jornada.numero}_${new Date().toISOString().split('T')[0]}.pdf`;
              const resultado = await whatsappService.enviarEmailConPDF(
                pdfBuffer, 
                nombreArchivo, 
                jornada.numero,
                'Torneo Nacional'
              );
              
              if (resultado.success) {
                console.log(`✅ PDF generado y enviado para jornada ${jornada.numero}`);
              } else {
                console.error(`❌ Error enviando PDF para jornada ${jornada.numero}:`, resultado.mensaje);
              }
            } else {
              console.warn(`⚠️ No se pudo generar PDF para jornada ${jornada.numero} (sin pronósticos)`);
            }
          } catch (error) {
            console.error(`❌ Error generando/enviando PDF para jornada ${jornada.numero}:`, error);
          }
        }, 2000); // 2 segundos de delay para asegurar que la respuesta HTTP se envíe primero
        
      } catch (error) {
        console.error('Error inicializando servicio de notificaciones:', error);
        // No fallar la respuesta por error de notificación
      }
    }
    
    res.json({ mensaje: `Jornada actualizada`, jornada });
  } catch (err) {
    res.status(500).json({ error: "No se pudo actualizar el estado de la jornada" });
  }
});

// PATCH /api/jornadas/:numero/ganadores
router.patch("/:numero/ganadores", async (req, res) => {
  const { numero } = req.params;
  try {
    // 1. Verifica si todos los resultados están cargados
    const incompletos = await pool.query(`
      SELECT COUNT(*) AS faltantes
      FROM partidos p
      JOIN jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      AND (p.goles_local IS NULL OR p.goles_visita IS NULL)
    `, [numero]);
    if (parseInt(incompletos.rows[0].faltantes) > 0) {
      return res.status(400).json({ error: "La jornada aún tiene partidos sin resultado" });
    }

    // 2. Calcula y guarda ganadores
    await pool.query(`
      WITH ranking AS (
        SELECT u.id, u.nombre, SUM(p.puntos) AS puntos
        FROM pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN partidos pa ON p.partido_id = pa.id
        JOIN jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = $1
        GROUP BY u.id
      ),
      ganadores AS (
        SELECT array_agg(nombre) AS nombres
        FROM ranking
        WHERE puntos = (SELECT MAX(puntos) FROM ranking)
      )
      UPDATE jornadas
      SET ganadores = (SELECT nombres FROM ganadores)
      WHERE numero = $1
    `, [numero]);

    // 3. Guardar en ganadores_jornada
    // Obtener id de la jornada
    const jornadaRes = await pool.query(
      "SELECT id FROM jornadas WHERE numero = $1",
      [numero]
    );
    const jornadaId = jornadaRes.rows[0]?.id;
    if (!jornadaId) {
      return res.status(404).json({ error: "Jornada no encontrada para guardar ganadores" });
    }

    // Obtener los ids de los ganadores
    const ganadoresIdsRes = await pool.query(`
      WITH ranking AS (
        SELECT u.id, SUM(p.puntos) AS puntos
        FROM pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN partidos pa ON p.partido_id = pa.id
        JOIN jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = $1
        GROUP BY u.id
      )
      SELECT id FROM ranking WHERE puntos = (SELECT MAX(puntos) FROM ranking)
    `, [numero]);
    const ganadoresIds = ganadoresIdsRes.rows.map(r => r.id);

    // Insertar los nuevos ganadores acumulando títulos (sin eliminar los anteriores)
    for (const jugadorId of ganadoresIds) {
      await pool.query(
        `INSERT INTO ganadores_jornada (jornada_id, jugador_id, acierto)
         VALUES ($1, $2, true)
         ON CONFLICT (jornada_id, jugador_id) DO NOTHING`,
        [jornadaId, jugadorId]
      );
    }

    res.json({ ok: true, message: "Ganadores guardados para la jornada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error calculando ganadores" });
  }
});

// === SUDAMERICANA: Gestión de usuarios activos ===
// GET /api/sudamericana/usuarios - Listar todos los usuarios y su estado en Sudamericana
// [COMENTADO - SUDAMERICANA] GET /sudamericana/usuarios - DUPLICADO - existe en /server/routes/admin_sud.js
// router.get('/sudamericana/usuarios', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT id, nombre, email, activo_sudamericana
//       FROM usuarios
//       ORDER BY nombre ASC
//     `);
//     res.json(result.rows);
//   } catch (err) {
//     res.status(500).json({ error: 'Error al obtener usuarios Sudamericana' });
//   }
// });

// [COMENTADO - SUDAMERICANA] PATCH /sudamericana/usuarios/:id - DUPLICADO - existe en /server/routes/admin_sud.js
// router.patch('/sudamericana/usuarios/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const { id } = req.params;
//   const { activo } = req.body;
//   try {
//     await pool.query(`
//       UPDATE usuarios SET activo_sudamericana = $2 WHERE id = $1
//     `, [id, !!activo]);
//     res.json({ ok: true });
//   } catch (err) {
//     res.status(500).json({ error: 'Error al actualizar usuario Sudamericana' });
//   }
// });

// 🔹 ENDPOINTS SUDAMERICANA (SOLO ADMIN, NO USUARIOS NORMALES)
// Los siguientes endpoints solo deben ser accesibles por administradores. Se protege con verifyToken y authorizeRoles('admin').

// [COMENTADO - SUDAMERICANA] POST /sudamericana/importar-fixture - DUPLICADO - existe en /server/routes/admin_sud.js
// router.post('/sudamericana/importar-fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const result = await importarFixtureSudamericana();
//   if (result.ok) {
//     res.json({ ok: true, total: result.total, insertados: result.insertados, detalles: result.detalles });
//   } else {
//     res.status(500).json({ ok: false, error: result.error });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /sudamericana/fixture/:ronda - DUPLICADO - existe en /server/routes/sudamericana.js
// router.get('/sudamericana/fixture/:ronda', async (req, res) => {
//   try {
//     const { ronda } = req.params;
//     
//     // Obtener partidos de la ronda
//     const result = await pool.query(
//       'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado, bonus FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
//       [ronda]
//     );
//     
//     let partidos = result.rows;
//     
//     // Aplicar reemplazo de siglas para mostrar nombres reales en el admin panel
//     if (partidos.length > 0) {
//       // Obtener clasificados reales desde la BD
//       const dicSiglasReales = await obtenerClasificadosReales();
//       
//       // Reemplazar siglas por nombres reales
//       partidos = reemplazarSiglasPorNombres(partidos, dicSiglasReales);
//     }
//     
//     // Siempre devolver un array, aunque esté vacío
//     res.json(Array.isArray(partidos) ? partidos : []);
//   } catch (err) {
//     console.error('Error al obtener el fixture de la ronda seleccionada:', err);
//     res.status(500).json({ error: 'Error al obtener el fixture de la ronda seleccionada.' });
//   }
// });

// [COMENTADO - SUDAMERICANA] PATCH /sudamericana/fixture/:ronda - DUPLICADO - existe en /server/routes/admin_sud.js
// router.patch('/sudamericana/fixture/:ronda', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   const { ronda } = req.params;
//   const { partidos } = req.body;
//   if (!Array.isArray(partidos) || partidos.length === 0) {
//     return res.status(400).json({ error: 'No se recibieron partidos para actualizar' });
//   }
//   let actualizados = 0;
//   try {
//     for (const partido of partidos) {
//       await pool.query(
//         `UPDATE sudamericana_fixtures
//          SET goles_local = $1, goles_visita = $2, bonus = $3, penales_local = $4, penales_visita = $5
//          WHERE fixture_id = $6 AND ronda = $7`,
//         [
//           partido.golesLocal !== '' ? partido.golesLocal : null,
//           partido.golesVisita !== '' ? partido.golesVisita : null,
//           partido.bonus ?? 1,
//           partido.penalesLocal !== undefined && partido.penalesLocal !== '' ? partido.penalesLocal : null,
//           partido.penalesVisita !== undefined && partido.penalesVisita !== '' ? partido.penalesVisita : null,
//           partido.id,
//           ronda
//         ]
//       );
//       actualizados++;
//     }
//
//     res.json({ 
//       mensaje: 'Resultados y penales actualizados en la base de datos', 
//       actualizados 
//     });
//   } catch (error) {
//     console.error('Error al actualizar partidos Sudamericana:', error);
//     res.status(500).json({ error: 'Error al actualizar partidos Sudamericana' });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /sudamericana/fixture - DUPLICADO - existe en /server/routes/sudamericana.js
// router.get('/sudamericana/fixture', async (req, res) => {
//   try {
//     const { ronda } = req.query;
//     let result;
//     if (ronda) {
//       result = await pool.query(
//         'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
//         [ronda]
//       );
//     } else {
//       result = await pool.query('SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures ORDER BY clasificado ASC, fecha ASC, fixture_id ASC');
//     }
//     
//     let partidos = result.rows;
//     
//     // Aplicar reemplazo de siglas para mostrar nombres reales usando equipo_clasificado_real
//     if (partidos.length > 0) {
//       // Función helper para obtener clasificados reales basándose en los fixtures oficiales
//       const obtenerClasificadosReales = async () => {
//         const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
//         const dic = {};
//         
//         for (const fixture of fixturesResult.rows) {
//           const { clasificado, equipo_clasificado_real } = fixture;
//           
//           // Si hay un clasificado definido, mapear la sigla al equipo real
//           if (clasificado && equipo_clasificado_real) {
//             dic[clasificado] = equipo_clasificado_real;
//           }
//         }
//         
//         return dic;
//       };
//       
//       const dicSiglasReales = await obtenerClasificadosReales();
//       
//       // Reemplazar siglas por nombres reales
//       partidos = reemplazarSiglasPorNombres(partidos, dicSiglasReales);
//     }
//     
//     res.json(partidos);
//   } catch (err) {
//     console.error('Error al obtener el fixture de la Copa Sudamericana:', err);
//     res.status(500).json({ error: 'Error al obtener el fixture de la Copa Sudamericana. Por favor, revisa la base de datos o la lógica de avance de cruces.' });
//   }
// });

// [COMENTADO - SUDAMERICANA] POST /sudamericana/actualizar-clasificados - DUPLICADO - existe en /server/routes/admin_sud.js
// router.post('/sudamericana/actualizar-clasificados', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   try {
//     // DESHABILITADO: No actualizar cruces automáticamente para preservar estructura de siglas
//     // await definirClasificadosPlayoffs();
//     res.json({ ok: true, message: 'Endpoint deshabilitado para preservar estructura de fixture.' });
//   } catch (error) {
//     console.error('Error al actualizar clasificados:', error);
//     res.status(500).json({ ok: false, error: error.message });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /sudamericana/rondas - DUPLICADO - existe en /server/routes/sudamericana.js
// router.get('/sudamericana/rondas', async (req, res) => {
//   try {
//     const result = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
//     res.json(result.rows.map(r => r.ronda));
//   } catch (err) {
//     res.status(500).json({ error: 'Error al obtener las rondas de la Sudamericana' });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /sudamericana/clasificados-reales - DUPLICADO - existe en /server/routes/admin_sud.js
// router.get('/sudamericana/clasificados-reales', async (req, res) => {
//   try {
//     const result = await pool.query('SELECT ronda, clasificados FROM clasif_sud ORDER BY ronda, clasificados');
//     res.json(result.rows);
//   } catch (err) {
//     console.error('Error al obtener clasificados reales:', err);
//     res.status(500).json({ error: 'Error al obtener clasificados reales' });
//   }
// });

// [COMENTADO - SUDAMERICANA] POST /sudamericana/avanzar-ganadores - DUPLICADO - existe en /server/routes/admin_sud.js
// router.post('/sudamericana/avanzar-ganadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
//   try {
//     const { avanzarGanadoresSudamericana } = await import('../services/clasificacionSudamericana.js');
//     await avanzarGanadoresSudamericana();
//     res.json({ ok: true, message: 'Ganadores avanzados correctamente en el fixture.' });
//   } catch (error) {
//     console.error('Error al avanzar ganadores:', error);
//     res.status(500).json({ ok: false, error: error.message });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /config - DUPLICADO - existe en /server/routes/admin_sud.js
// router.get('/config', async (req, res) => {
//   try {
//     const { rows } = await pool.query('SELECT * FROM sudamericana_config LIMIT 1');
//     if (!rows.length) {
//       await pool.query('INSERT INTO sudamericana_config (edicion_cerrada, fecha_cierre) VALUES (false, NULL)');
//     }
//     const { rows: final } = await pool.query('SELECT * FROM sudamericana_config LIMIT 1');
//     res.json(final[0]);
//   } catch (err) {
//     res.status(500).json({ error: 'Error al obtener la configuración' });
//   }
// });

// COMENTADO: Este endpoint causaba conflicto con admin_sud.js
// El endpoint correcto está en /routes/admin_sud.js
/*
// PATCH /api/jornadas/sudamericana/cerrar → cambia el estado global de edicion_cerrada
router.patch('/cerrar', async (req, res) => {
  const { cerrada } = req.body; // true o false
  try {
    console.log('DEBUG jornadas.js /cerrar - cerrada:', cerrada);
    
    // Simplificar como el endpoint de admin_sud.js
    const result = await pool.query(
      'UPDATE sudamericana_config SET edicion_cerrada = $1 WHERE id = 1 RETURNING *',
      [cerrada]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    
    const config = result.rows[0];
    console.log('Estado actualizado jornadas.js:', config);
    
    res.json({ 
      ok: true, 
      edicion_cerrada: config.edicion_cerrada, 
      actualizado: result.rowCount > 0 
    });
  } catch (err) {
    console.error('Error SQL en /api/jornadas/sudamericana/cerrar:', err);
    res.status(500).json({ error: 'No se pudo actualizar el estado de la jornada', detalle: err.message, stack: err.stack });
  }
});
*/

// MOVER ESTOS AL FINAL DEL ARCHIVO PARA NO ROMPER LAS RUTAS ESPECÍFICAS
router.use("/ganadores", ganadoresRouter);
// [COMENTADO - SUDAMERICANA] Router de pronósticos - DUPLICADO - ya se monta en index.js 
// router.use("/sudamericana", pronosticosSudamericanaRouter);

// [COMENTADO - SUDAMERICANA] Alias directo para compatibilidad - DUPLICADO - existe en /server/routes/sudamericana.js
// router.get('/fixture/:ronda', async (req, res, next) => {
//   // Si la ruta ya fue respondida por /sudamericana/fixture/:ronda, no hacer nada
//   // Si no, replicar la lógica
//   try {
//     const { ronda } = req.params;
//     const result = await pool.query(
//       'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado, bonus FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
//       [ronda]
//     );
//     res.json(Array.isArray(result.rows) ? result.rows : []);
//   } catch (err) {
//     console.error('Error en alias /api/sudamericana/fixture/:ronda:', err);
//     res.status(500).json({ error: 'Error al obtener el fixture de la ronda seleccionada (alias).' });
//   }
// });

// [COMENTADO - SUDAMERICANA] GET /sudamericana/config - DUPLICADO - existe en /server/routes/admin_sud.js
// router.get('/sudamericana/config', async (req, res) => {
//   try {
//     const { rows } = await pool.query('SELECT * FROM sudamericana_config LIMIT 1');
//     if (!rows.length) {
//       await pool.query('INSERT INTO sudamericana_config (edicion_cerrada, fecha_cierre) VALUES (false, NULL)');
//     }
//     const { rows: final } = await pool.query('SELECT * FROM sudamericana_config LIMIT 1');
//     res.json(final[0]);
//   } catch (err) {
//     res.status(500).json({ error: 'Error al obtener la configuración' });
//   }
// });

// 🔹 POST /api/jornadas/importar-fixture → Importar fixture completo (30 jornadas)
router.post("/importar-fixture", verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { fixtureTexto } = req.body;

  if (!fixtureTexto || typeof fixtureTexto !== 'string') {
    return res.status(400).json({ error: "Se requiere el texto del fixture" });
  }

  try {
    const lineas = fixtureTexto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let jornadaActual = null;
    let numeroJornada = null;
    let jornadasCreadas = 0;
    let partidosCreados = 0;
    const errores = [];
    
    console.log(`📋 Procesando ${lineas.length} líneas...`);
    
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      
      // Saltar líneas que son encabezados de sección
      if (linea.match(/^(PRIMERA|SEGUNDA)\s+RUEDA/i)) {
        console.log(`ℹ️  Sección: ${linea}`);
        continue;
      }
      
      // Detectar línea de jornada con múltiples formatos
      // "Jornada 1", "Fecha 1", "Fecha 1 – 16 feb", "Fecha 16 – 20 jul"
      const matchJornada = linea.match(/^(?:Jornada|Fecha)\s*(\d+)/i);
      if (matchJornada) {
        numeroJornada = parseInt(matchJornada[1]);
        console.log(`✅ Detectada jornada ${numeroJornada}`);
        
        // Buscar o crear la jornada
        const jornadaExistente = await pool.query(
          "SELECT id FROM jornadas WHERE numero = $1",
          [numeroJornada]
        );
        
        if (jornadaExistente.rowCount === 0) {
          const nuevaJornada = await pool.query(
            "INSERT INTO jornadas (numero, cerrada) VALUES ($1, false) RETURNING id",
            [numeroJornada]
          );
          jornadaActual = nuevaJornada.rows[0].id;
          jornadasCreadas++;
          console.log(`✅ Jornada ${numeroJornada} creada con ID ${jornadaActual}`);
        } else {
          jornadaActual = jornadaExistente.rows[0].id;
          console.log(`ℹ️  Jornada ${numeroJornada} ya existe con ID ${jornadaActual}`);
        }
        
        continue;
      }
      
      // Detectar línea de partido con múltiples formatos
      // "Equipo Local vs Equipo Visita", "Equipo Local v/s Equipo Visita"
      const matchPartido = linea.match(/^(.+?)\s+(?:vs|v\/s)\s+(.+)$/i);
      if (matchPartido && jornadaActual) {
        const local = matchPartido[1].trim();
        const visita = matchPartido[2].trim();
        
        console.log(`⚽ Partido detectado: ${local} vs ${visita} (Jornada ${numeroJornada})`);
        
        // Verificar si el partido ya existe
        const partidoExistente = await pool.query(
          `SELECT id FROM partidos 
           WHERE jornada_id = $1 
           AND nombre_local = $2 
           AND nombre_visita = $3`,
          [jornadaActual, local, visita]
        );
        
        if (partidoExistente.rowCount === 0) {
          await pool.query(
            `INSERT INTO partidos (jornada_id, nombre_local, nombre_visita, status, bonus) 
             VALUES ($1, $2, $3, 'NS', 1)`,
            [jornadaActual, local, visita]
          );
          partidosCreados++;
          console.log(`✅ Partido creado: ${local} vs ${visita}`);
        } else {
          console.log(`ℹ️  Partido ya existe: ${local} vs ${visita}`);
        }
      } else if (jornadaActual && linea.length > 5 && !matchJornada) {
        // Línea no reconocida que podría ser un partido
        errores.push(`Línea ${i + 1} no reconocida: "${linea}"`);
        console.log(`⚠️  Línea no reconocida: "${linea}"`);
      }
    }
    
    console.log(`✅ Proceso completado: ${jornadasCreadas} jornadas, ${partidosCreados} partidos`);
    
    res.json({
      ok: true,
      message: "Fixture importado exitosamente",
      jornadasCreadas,
      partidosCreados,
      errores: errores.length > 0 ? errores : undefined
    });
    
  } catch (error) {
    console.error("Error importando fixture:", error);
    res.status(500).json({ 
      error: "Error al importar el fixture", 
      details: error.message 
    });
  }
});

// Función para cierre automático de jornadas basándose en fecha_cierre
async function cierreAutomaticoJornadas() {
  try {
    // Buscar jornadas abiertas con fecha_cierre definida y que ya hayan pasado esa fecha
    const result = await pool.query(`
      SELECT id, numero, fecha_cierre, cerrada 
      FROM jornadas 
      WHERE cerrada = false 
        AND fecha_cierre IS NOT NULL 
        AND fecha_cierre <= NOW()
    `);

    for (const jornada of result.rows) {
      console.log(`🔒 Cerrando automáticamente jornada ${jornada.numero}`);
      
      // Cerrar la jornada
      await pool.query(
        "UPDATE jornadas SET cerrada = true WHERE id = $1",
        [jornada.id]
      );

      // Enviar email de notificación
      try {
        const whatsappService = getWhatsAppService();
        const resultado = await whatsappService.enviarMensajeJornadaCerrada(jornada.numero);
        
        if (resultado.success) {
          console.log(`✅ Email enviado para jornada ${jornada.numero}`);
        } else {
          console.error(`❌ Error enviando email para jornada ${jornada.numero}:`, resultado.mensaje);
        }
      } catch (error) {
        console.error(`❌ Error enviando email para jornada ${jornada.numero}:`, error);
      }
    }
  } catch (err) {
    console.error('❌ Error en cierre automático de jornadas:', err);
  }
}

export { cierreAutomaticoJornadas };
export default router;
