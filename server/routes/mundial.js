import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import htmlPdf from 'html-pdf-node';
import { getLogoUrl } from '../utils/logoHelper.js';
import { insertarPronosticosAusentesMundial } from '../utils/insertarPronosticosAusentes.js';

const router = express.Router();

// ==================== GESTIÓN DE EQUIPOS ====================

// Obtener todos los grupos
router.get('/grupos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT grupo FROM mundial_partidos 
      WHERE grupo IS NOT NULL 
      ORDER BY grupo
    `);
    
    const grupos = result.rows.map(r => ({ letra: r.grupo }));
    res.json(grupos);
  } catch (error) {
    console.error('Error obteniendo grupos:', error);
    res.status(500).json({ error: 'Error obteniendo grupos' });
  }
});

// Obtener todos los equipos
router.get('/equipos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM mundial_equipos 
      ORDER BY grupo, posicion_grupo
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo equipos:', error);
    res.status(500).json({ error: 'Error obteniendo equipos' });
  }
});

// Guardar/Actualizar equipos (Admin)
router.post('/equipos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { equipos } = req.body;
    
    if (!Array.isArray(equipos) || equipos.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de equipos' });
    }

    await pool.query('DELETE FROM mundial_equipos');

    const gruposCount = {};
    
    for (const equipo of equipos) {
      if (!equipo.nombre || !equipo.grupo) {
        console.warn('Equipo sin nombre o grupo:', equipo);
        continue;
      }

      const grupo = equipo.grupo.toUpperCase();
      
      if (!gruposCount[grupo]) {
        gruposCount[grupo] = 0;
      }
      gruposCount[grupo]++;
      
      await pool.query(`
        INSERT INTO mundial_equipos (nombre, grupo, posicion_grupo, api_id, pais)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        equipo.nombre,
        grupo,
        gruposCount[grupo],
        equipo.api_id || null,
        equipo.pais || ''
      ]);
    }

    res.json({ mensaje: 'Equipos guardados exitosamente', total: equipos.length });
  } catch (error) {
    console.error('Error guardando equipos:', error);
    res.status(500).json({ error: 'Error guardando equipos', details: error.message });
  }
});

// ==================== GESTIÓN DE JORNADAS ====================

// Obtener todas las jornadas
router.get('/jornadas', async (req, res) => {
  try {
    let result = await pool.query(`
      SELECT * FROM mundial_jornadas 
      ORDER BY numero
    `);

    // Si no hay jornadas, crearlas automáticamente
    if (result.rows.length === 0) {
      const jornadas = [
        { numero: 1, nombre: 'Jornada 1 - Fase de Grupos', activa: false, descripcion: 'Primera fecha de la fase de grupos' },
        { numero: 2, nombre: 'Jornada 2 - Fase de Grupos', activa: false, descripcion: 'Segunda fecha de la fase de grupos' },
        { numero: 3, nombre: 'Jornada 3 - Fase de Grupos', activa: false, descripcion: 'Tercera fecha de la fase de grupos' },
        { numero: 4, nombre: 'Jornada 4 - 16vos de Final', activa: false, descripcion: '16vos de final (16 partidos)' },
        { numero: 5, nombre: 'Jornada 5 - Octavos de Final', activa: false, descripcion: 'Octavos de final (8 partidos)' },
        { numero: 6, nombre: 'Jornada 6 - Cuartos de Final', activa: false, descripcion: 'Cuartos de final (4 partidos)' },
        { numero: 7, nombre: 'Jornada 7 - Finales', activa: false, descripcion: 'Semifinales, tercer lugar y final (5 partidos)' }
      ];

      for (const jornada of jornadas) {
        await pool.query(`
          INSERT INTO mundial_jornadas (numero, nombre, activa, cerrada, descripcion)
          VALUES ($1, $2, $3, false, $4)
          ON CONFLICT (numero) DO NOTHING
        `, [jornada.numero, jornada.nombre, jornada.activa, jornada.descripcion]);
      }

      result = await pool.query(`
        SELECT * FROM mundial_jornadas 
        ORDER BY numero
      `);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// Obtener jornada específica
router.get('/jornadas/:numero', async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaResult = await pool.query(`
      SELECT * FROM mundial_jornadas WHERE numero = $1
    `, [numero]);
    
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }
    
    const partidosResult = await pool.query(`
      SELECT 
        p.*,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        el.pais as pais_local,
        ev.pais as pais_visita
      FROM mundial_partidos p
      LEFT JOIN mundial_equipos el ON el.nombre = p.equipo_local
      LEFT JOIN mundial_equipos ev ON ev.nombre = p.equipo_visitante
      WHERE p.jornada_id = $1
      ORDER BY p.fecha, p.id
    `, [jornadaResult.rows[0].id]);
    
    res.json({
      ...jornadaResult.rows[0],
      partidos: partidosResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo jornada:', error);
    res.status(500).json({ error: 'Error obteniendo jornada' });
  }
});

// Obtener todos los partidos de todas las jornadas
router.get('/partidos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        j.numero as jornada_numero,
        j.nombre as jornada_nombre,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        el.pais as pais_local,
        ev.pais as pais_visita
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas j ON j.id = p.jornada_id
      LEFT JOIN mundial_equipos el ON el.nombre = p.equipo_local
      LEFT JOIN mundial_equipos ev ON ev.nombre = p.equipo_visitante
      ORDER BY j.numero, p.fecha, p.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// GET /jornadas/:numero/partidos — partidos de una jornada con conteo de pronósticos (Admin)
router.get('/jornadas/:numero/partidos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const result = await pool.query(`
      SELECT
        p.*,
        j.numero as jornada_numero,
        COALESCE(pc.cnt, 0)::int as pronosticos_count
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas j ON j.id = p.jornada_id
      LEFT JOIN (
        SELECT partido_id, COUNT(*) as cnt
        FROM mundial_pronosticos
        GROUP BY partido_id
      ) pc ON p.id = pc.partido_id
      WHERE j.numero = $1
      ORDER BY p.fecha, p.id
    `, [numero]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo partidos de jornada' });
  }
});

// POST /jornadas/:numero/fixture-append — agrega partidos SIN borrar los existentes (Admin)
router.post('/jornadas/:numero/fixture-append', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { partidos } = req.body;

    if (!Array.isArray(partidos) || partidos.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de partidos' });
    }

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );
    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }
    const jornadaId = jornadaResult.rows[0].id;

    // Insertar sin borrar lo existente
    for (const partido of partidos) {
      await pool.query(`
        INSERT INTO mundial_partidos (jornada_id, equipo_local, equipo_visitante, fecha, estadio, api_id, partido_numero, grupo, bonus)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        jornadaId,
        partido.equipo_local,
        partido.equipo_visitante,
        partido.fecha || null,
        partido.estadio || null,
        partido.api_id || null,
        partido.partido_numero || null,
        partido.grupo || null,
        partido.bonus || 1
      ]);
    }

    res.json({ mensaje: `${partidos.length} partido(s) agregado(s) exitosamente`, agregados: partidos.length });
  } catch (error) {
    console.error('Error en fixture-append:', error);
    res.status(500).json({ error: 'Error agregando partidos', details: error.message });
  }
});

// DELETE /partidos/:id — elimina un partido individual (solo si no tiene pronósticos) (Admin)
router.delete('/partidos/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el partido existe
    const existeResult = await pool.query('SELECT id FROM mundial_partidos WHERE id = $1', [id]);
    if (existeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    // Bloquear si tiene pronósticos
    const pronosticosResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM mundial_pronosticos WHERE partido_id = $1',
      [id]
    );
    if (parseInt(pronosticosResult.rows[0].cnt) > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: este partido tiene pronósticos ingresados' });
    }

    await pool.query('DELETE FROM mundial_partidos WHERE id = $1', [id]);
    res.json({ mensaje: 'Partido eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando partido:', error);
    res.status(500).json({ error: 'Error eliminando partido', details: error.message });
  }
});

// Guardar fixture de una jornada (Admin)
router.post('/jornadas/:numero/fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { partidos } = req.body;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;
    
    // Eliminar partidos existentes de esta jornada
    await pool.query('DELETE FROM mundial_partidos WHERE jornada_id = $1', [jornadaId]);

    // Insertar nuevos partidos
    for (const partido of partidos) {
      await pool.query(`
        INSERT INTO mundial_partidos (
          jornada_id, equipo_local, equipo_visitante, fecha, 
          estadio, api_id, partido_numero, grupo, bonus
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        jornadaId,
        partido.equipo_local,
        partido.equipo_visitante,
        partido.fecha || null,
        partido.estadio || null,
        partido.api_id || null,
        partido.partido_numero || null,
        partido.grupo || null,
        partido.bonus || 1
      ]);
    }

    res.json({ mensaje: 'Fixture guardado exitosamente', partidos: partidos.length });
  } catch (error) {
    console.error('Error guardando fixture:', error);
    res.status(500).json({ error: 'Error guardando fixture', details: error.message });
  }
});

// Actualizar resultados de partidos (Admin)
router.patch('/partidos/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { resultado_local, resultado_visitante, bonus, quien_avanzo } = req.body;

    // Construir la query dinámicamente según los campos enviados
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (resultado_local !== undefined) {
      updates.push(`resultado_local = $${paramCounter}`);
      values.push(resultado_local);
      paramCounter++;
    }

    if (resultado_visitante !== undefined) {
      updates.push(`resultado_visitante = $${paramCounter}`);
      values.push(resultado_visitante);
      paramCounter++;
    }

    if (bonus !== undefined) {
      updates.push(`bonus = $${paramCounter}`);
      values.push(bonus);
      paramCounter++;
    }

    if (quien_avanzo !== undefined) {
      updates.push(`quien_avanzo = $${paramCounter}`);
      values.push(quien_avanzo);
      paramCounter++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);

    const result = await pool.query(`
      UPDATE mundial_partidos 
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    // Crear notificación si se ingresó un resultado real
    const partido = result.rows[0];
    if ((resultado_local !== undefined && resultado_local !== null) || 
        (resultado_visitante !== undefined && resultado_visitante !== null)) {
      
      // Obtener número de jornada del partido
      const jornadaResult = await pool.query(
        'SELECT numero FROM mundial_jornadas WHERE id = $1',
        [partido.jornada_id]
      );
      
      if (jornadaResult.rows.length > 0) {
        const jornadaNumero = jornadaResult.rows[0].numero;
        
        await pool.query(
          `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, mensaje, icono, url, jornada_numero)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'mundial',
            'resultados',
            'resultados_agregados',
            `📊 Se ha agregado un resultado real en la Jornada ${jornadaNumero} - Mundial`,
            '📊',
            `/mundial/jornada/${jornadaNumero}`,
            jornadaNumero
          ]
        );
        console.log(`✅ Notificación Mundial: resultado agregado para jornada ${jornadaNumero}`);
      }
    }

    res.json({ mensaje: 'Partido actualizado', partido });
  } catch (error) {
    console.error('Error actualizando partido:', error);
    res.status(500).json({ error: 'Error actualizando partido' });
  }
});

// Activar/desactivar jornada (Admin)
router.patch('/jornadas/:numero/toggle', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET activa = NOT activa
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Estado de jornada actualizado', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando jornada:', error);
    res.status(500).json({ error: 'Error actualizando jornada' });
  }
});

// Cerrar jornada (Admin)
router.patch('/jornadas/:numero/cerrar', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET cerrada = true, activa = false
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornada = result.rows[0];
    
    // Insertar pronósticos aleatorios para usuarios sin pronósticos
    try {
      const insertados = await insertarPronosticosAusentesMundial(jornada.id);
      if (insertados > 0) {
        console.log(`⚽ ${insertados} pronósticos aleatorios insertados para usuarios sin pronósticos (Mundial J${jornada.numero})`);
      }
    } catch (errIns) {
      console.error(`❌ Error insertando pronósticos ausentes Mundial J${jornada.numero}:`, errIns);
    }

    // Crear notificación cuando se cierra la jornada
    await pool.query(
      `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, mensaje, icono, url, jornada_numero)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'mundial',
        'jornada',
        'jornada_cerrada',
        `🔒 La Jornada ${jornada.numero} del Mundial ha sido cerrada. Ya no se aceptan pronósticos.`,
        '🔒',
        `/mundial/jornada/${jornada.numero}`,
        jornada.numero
      ]
    );
    console.log(`✅ Notificación Mundial: jornada ${jornada.numero} cerrada`);

    res.json({ mensaje: 'Jornada cerrada exitosamente', jornada });
  } catch (error) {
    console.error('Error cerrando jornada:', error);
    res.status(500).json({ error: 'Error cerrando jornada' });
  }
});

// Abrir jornada (Admin)
router.patch('/jornadas/:numero/abrir', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET cerrada = false
      WHERE numero = $1
      RETURNING *
    `, [numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    res.json({ mensaje: 'Jornada abierta exitosamente', jornada: result.rows[0] });
  } catch (error) {
    console.error('Error abriendo jornada:', error);
    res.status(500).json({ error: 'Error abriendo jornada' });
  }
});

// Actualizar fecha de cierre de jornada (Admin)
router.patch('/jornadas/:numero/fecha-cierre', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;
    const { fecha_cierre } = req.body;

    const result = await pool.query(`
      UPDATE mundial_jornadas 
      SET fecha_cierre = $1 
      WHERE numero = $2
      RETURNING *
    `, [fecha_cierre, numero]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornada = result.rows[0];
    
    // Crear notificación de fecha de cierre actualizada
    if (fecha_cierre) {
      const fechaFormateada = new Date(fecha_cierre).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Santiago'
      });
      
      await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, mensaje, icono, url, jornada_numero)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'mundial',
          'fecha_cierre',
          'fecha_cierre_actualizada',
          `⏰ Fecha de cierre actualizada para Jornada ${jornada.numero} - Mundial: ${fechaFormateada}`,
          '⏰',
          `/mundial/jornada/${jornada.numero}`,
          jornada.numero
        ]
      );
      console.log(`✅ Notificación Mundial: fecha de cierre actualizada para jornada ${jornada.numero}`);
    }

    res.json({ mensaje: 'Fecha de cierre actualizada', jornada });
  } catch (error) {
    console.error('Error actualizando fecha de cierre:', error);
    res.status(500).json({ error: 'Error actualizando fecha de cierre' });
  }
});

// Eliminar fixture de una jornada (Admin)
router.delete('/jornadas/:numero/fixture', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;
    await pool.query('DELETE FROM mundial_partidos WHERE jornada_id = $1', [jornadaId]);
    await pool.query('DELETE FROM mundial_pronosticos WHERE jornada_id = $1', [jornadaId]);
    await pool.query('DELETE FROM mundial_ganadores_jornada WHERE jornada_numero = $1', [numero]);

    res.json({ mensaje: 'Fixture eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando fixture:', error);
    res.status(500).json({ error: 'Error eliminando fixture' });
  }
});

// ==================== GESTIÓN DE PRONÓSTICOS ====================

// Obtener pronósticos del usuario para una jornada
router.get('/pronosticos/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const usuario_id = req.usuario.id;

    const jornadaResult = await pool.query(
      'SELECT id FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornadaId = jornadaResult.rows[0].id;

    const result = await pool.query(`
      SELECT p.*, 
             part.equipo_local, 
             part.equipo_visitante,
             part.resultado_local as resultado_real_local,
             part.resultado_visitante as resultado_real_visitante
      FROM mundial_pronosticos p
      INNER JOIN mundial_partidos part ON part.id = p.partido_id
      WHERE p.usuario_id = $1 AND p.jornada_id = $2
      ORDER BY part.id
    `, [usuario_id, jornadaId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// Guardar pronósticos del usuario para una jornada
router.post('/pronosticos/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const usuario_id = req.usuario.id;
    const { pronosticos } = req.body;

    // Verificar si el usuario está activo en Mundial
    const usuarioCheck = await pool.query(
      'SELECT activo_mundial FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    // Solo permitir si está explícitamente en true
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_mundial !== true) {
      console.log('🚫 Usuario sin acceso al Mundial:', usuario_id, usuarioCheck.rows[0]);
      return res.status(403).json({ error: 'No tienes acceso para ingresar pronósticos en el Mundial 2026' });
    }

    if (!Array.isArray(pronosticos) || pronosticos.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de pronósticos' });
    }

    // Verificar que la jornada existe y está activa
    const jornadaResult = await pool.query(
      'SELECT id, activa, cerrada FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const jornada = jornadaResult.rows[0];

    if (jornada.cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada, no se pueden modificar pronósticos' });
    }

    if (!jornada.activa) {
      return res.status(403).json({ error: 'Esta jornada no está activa para ingresar pronósticos' });
    }

    // Guardar cada pronóstico
    for (const pronostico of pronosticos) {
      await pool.query(`
        INSERT INTO mundial_pronosticos 
        (usuario_id, jornada_id, partido_id, resultado_local, resultado_visitante, quien_avanza)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (usuario_id, partido_id)
        DO UPDATE SET 
          resultado_local = EXCLUDED.resultado_local,
          resultado_visitante = EXCLUDED.resultado_visitante,
          quien_avanza = EXCLUDED.quien_avanza,
          actualizado_en = NOW()
      `, [
        usuario_id,
        jornada.id,
        pronostico.partido_id,
        pronostico.resultado_local,
        pronostico.resultado_visitante,
        pronostico.quien_avanza || null
      ]);
    }

    res.json({ 
      mensaje: 'Pronósticos guardados exitosamente',
      total: pronosticos.length 
    });

    // Auto-generar bracket virtual para J7 después de guardar predicciones de semis
    if (numero === '7') {
      try {
        const semis = await pool.query(`
          SELECT p.id, p.equipo_local, p.equipo_visitante
          FROM mundial_partidos p INNER JOIN mundial_jornadas mj ON p.jornada_id=mj.id
          WHERE mj.numero=7 AND p.subtipo='semifinal' ORDER BY p.id`);
        if (semis.rows.length >= 2) {
          const [semi1, semi2] = semis.rows;
          const predsRes = await pool.query(`
            SELECT partido_id, resultado_local, resultado_visitante, quien_avanza
            FROM mundial_pronosticos WHERE usuario_id=$1 AND partido_id IN ($2,$3)`,
            [usuario_id, semi1.id, semi2.id]);
          if (predsRes.rows.length === 2) {
            const p1 = predsRes.rows.find(p => p.partido_id === semi1.id);
            const p2 = predsRes.rows.find(p => p.partido_id === semi2.id);
            const getWL = (pred, match) => {
              let w, l;
              if (pred.resultado_local > pred.resultado_visitante) { w=match.equipo_local; l=match.equipo_visitante; }
              else if (pred.resultado_visitante > pred.resultado_local) { w=match.equipo_visitante; l=match.equipo_local; }
              else { w=pred.quien_avanza||match.equipo_local; l=(w===match.equipo_local)?match.equipo_visitante:match.equipo_local; }
              return {w,l};
            };
            const r1 = getWL(p1, semi1), r2 = getWL(p2, semi2);
            const bracket = [{posicion:1,equipo:r1.w},{posicion:2,equipo:r2.w},{posicion:3,equipo:r1.l},{posicion:4,equipo:r2.l}];
            for (const b of bracket) {
              await pool.query(`INSERT INTO mundial_pronosticos_final_virtual (usuario_id,equipo,posicion,puntos) VALUES ($1,$2,$3,0) ON CONFLICT (usuario_id,posicion) DO UPDATE SET equipo=EXCLUDED.equipo,actualizado_en=NOW()`, [usuario_id, b.equipo, b.posicion]);
            }
            console.log(`✅ Bracket virtual J7 generado para usuario ${usuario_id}: Final ${r1.w} vs ${r2.w} | 3er ${r1.l} vs ${r2.l}`);
          }
        }
      } catch (bracketErr) {
        console.error('⚠️ Error generando bracket virtual J7:', bracketErr.message);
      }
    }
  } catch (error) {
    console.error('Error guardando pronósticos:', error);
    res.status(500).json({ error: 'Error guardando pronósticos', details: error.message });
  }
});

// ==================== PDF TESTIGO (pronósticos antes del inicio) ====================

// Generar PDF testigo con pronósticos de una jornada del Mundial
router.post('/generar-pdf-testigo/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    console.log(`📄 Generando PDF Testigo Mundial para jornada ${numero}...`);

    // Obtener todos los pronósticos de la jornada
    const pronosticosResult = await pool.query(`
      SELECT 
        u.nombre AS usuario,
        mpa.equipo_local,
        mpa.equipo_visitante,
        mpa.fecha,
        mp.resultado_local AS goles_local,
        mp.resultado_visitante AS goles_visita
      FROM mundial_pronosticos mp
      JOIN usuarios u ON mp.usuario_id = u.id
      JOIN mundial_partidos mpa ON mp.partido_id = mpa.id
      JOIN mundial_jornadas mj ON mpa.jornada_id = mj.id
      WHERE mj.numero = $1
      ORDER BY u.nombre, mpa.fecha
    `, [numero]);

    if (pronosticosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pronósticos para esta jornada' });
    }

    const pronosticos = pronosticosResult.rows;

    // Obtener nombre de la jornada
    const jornadaResult = await pool.query(
      'SELECT nombre FROM mundial_jornadas WHERE numero = $1',
      [numero]
    );
    const nombreJornada = jornadaResult.rows[0]?.nombre || `Jornada ${numero}`;

    // Obtener lista única de partidos ordenados por fecha
    const partidosUnicos = [];
    const partidosVistos = new Set();
    pronosticos.forEach(p => {
      const key = `${p.equipo_local}|${p.equipo_visitante}|${p.fecha}`;
      if (!partidosVistos.has(key)) {
        partidosVistos.add(key);
        partidosUnicos.push({
          equipo_local: p.equipo_local,
          equipo_visitante: p.equipo_visitante,
          fecha: p.fecha
        });
      }
    });
    partidosUnicos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {};
      }
      const key = `${p.equipo_local}|${p.equipo_visitante}`;
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
            color: #1a5490;
            margin-bottom: 15px;
            border-bottom: 3px solid #1a5490;
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
            color: #1a5490;
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
            background-color: #1a5490;
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
          tr:hover { background-color: #f9f9f9; }
          .pronostico {
            font-weight: bold;
            color: #1a5490;
            font-size: 22px;
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
          <h1>🌍 Pronósticos Mundial 2026</h1>
          <p>${nombreJornada}</p>
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
                  const key = `${partido.equipo_local}|${partido.equipo_visitante}`;
                  const p = pronosticosPorUsuario[usuario][key];

                  const logoLocal = getLogoUrl(partido.equipo_local) || '';
                  const logoVisita = getLogoUrl(partido.equipo_visitante) || '';

                  if (!p) {
                    return `
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center;">
                            ${logoLocal ? `<img src="${logoLocal}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                            <span>${partido.equipo_local}</span>
                            <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                            ${logoVisita ? `<img src="${logoVisita}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                            <span>${partido.equipo_visitante}</span>
                          </div>
                        </td>
                        <td class="pronostico" style="color: #999;">Sin pronóstico</td>
                      </tr>
                    `;
                  }

                  return `
                    <tr>
                      <td>
                        <div style="display: flex; align-items: center;">
                          ${logoLocal ? `<img src="${logoLocal}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                          <span>${p.equipo_local}</span>
                          <span style="margin: 0 8px; color: #999; font-weight: bold;">vs</span>
                          ${logoVisita ? `<img src="${logoVisita}" style="width: 24px; height: 24px; object-fit: contain; margin-right: 6px;">` : ''}
                          <span>${p.equipo_visitante}</span>
                        </div>
                      </td>
                      <td class="pronostico">${p.goles_local}-${p.goles_visita}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        <div class="footer">
          <p>Campeonato Itaú - Mundial 2026</p>
          <p>Este documento certifica los pronósticos registrados antes del inicio de la jornada</p>
        </div>
      </body>
      </html>
    `;

    // Generar PDF con html-pdf-node
    console.log('📄 Generando PDF Testigo Mundial...');
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    const file = { content: htmlContent };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log('✅ PDF Testigo Mundial generado exitosamente');

    const nombreArchivo = `Mundial_Testigo_Jornada_${numero}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando PDF Testigo Mundial:', error);
    res.status(500).json({
      error: 'Error generando PDF Testigo',
      detalles: error.message
    });
  }
});

// GET /api/mundial/pronosticos-todos/jornada/:numero — todos los pronósticos de una jornada (para simulador)
router.get('/pronosticos-todos/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const result = await pool.query(`
      SELECT 
        mp.id,
        mp.partido_id,
        mp.resultado_local AS goles_local,
        mp.resultado_visitante AS goles_visita,
        mp.puntos,
        u.nombre AS usuario,
        u.foto_perfil AS usuario_foto_perfil
      FROM mundial_pronosticos mp
      JOIN usuarios u ON mp.usuario_id = u.id
      JOIN mundial_partidos mpa ON mp.partido_id = mpa.id
      JOIN mundial_jornadas mj ON mpa.jornada_id = mj.id
      WHERE mj.numero = $1
      ORDER BY u.nombre
    `, [numero]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// GET /api/mundial/resumen/jornada/:numero — resumen agrupado de pronósticos (para resumen jornada)
router.get('/resumen/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;

    const partidosResult = await pool.query(`
      SELECT mpa.id, mpa.equipo_local, mpa.equipo_visitante, mpa.fecha
      FROM mundial_partidos mpa
      JOIN mundial_jornadas mj ON mpa.jornada_id = mj.id
      WHERE mj.numero = $1
      ORDER BY mpa.fecha, mpa.id
    `, [numero]);

    const partidos = [];

    for (const partido of partidosResult.rows) {
      const pronosticosResult = await pool.query(`
        SELECT 
          mp.resultado_local AS goles_local,
          mp.resultado_visitante AS goles_visita,
          u.id,
          u.nombre,
          u.foto_perfil
        FROM mundial_pronosticos mp
        JOIN usuarios u ON mp.usuario_id = u.id
        WHERE mp.partido_id = $1
        ORDER BY mp.resultado_local, mp.resultado_visitante, u.nombre
      `, [partido.id]);

      // Agrupar por resultado
      const grupos = {};
      for (const p of pronosticosResult.rows) {
        const key = `${p.goles_local}-${p.goles_visita}`;
        if (!grupos[key]) {
          grupos[key] = {
            resultado: key,
            goles_local: p.goles_local,
            goles_visita: p.goles_visita,
            cantidad: 0,
            usuarios: []
          };
        }
        grupos[key].cantidad++;
        grupos[key].usuarios.push({ id: p.id, nombre: p.nombre, foto_perfil: p.foto_perfil });
      }

      const totalPronosticos = pronosticosResult.rows.length;
      const gruposArray = Object.values(grupos)
        .sort((a, b) => b.cantidad - a.cantidad)
        .map(g => ({
          ...g,
          porcentaje: totalPronosticos > 0 ? ((g.cantidad / totalPronosticos) * 100).toFixed(1) : '0'
        }));

      partidos.push({
        partido_id: partido.id,
        nombre_local: partido.equipo_local,
        nombre_visita: partido.equipo_visitante,
        fecha: partido.fecha,
        total_pronosticos: totalPronosticos,
        grupos: gruposArray
      });
    }

    res.json({ partidos });
  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    res.status(500).json({ error: 'Error obteniendo resumen' });
  }
});

export default router;
