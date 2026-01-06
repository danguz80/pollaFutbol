import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';

const router = express.Router();

// IMPORTANTE: Rutas específicas (/acumulado) ANTES de rutas con parámetros (/:jornadaNumero)

// POST: Calcular y guardar ganador del ranking acumulado TOTAL (todas las jornadas)
router.post('/acumulado', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    // Verificar/crear tabla sudamericana_ganadores_acumulado (NO hacer DROP - mantener histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas)
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      WHERE u.activo_sudamericana = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COALESCE(SUM(sp.puntos), 0) > 0
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `);
    
    if (rankingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos' });
    }
    
    // Obtener el top 3 del ranking para guardar en históricos
    const top3 = rankingResult.rows.slice(0, 3);
    
    // Encontrar el puntaje máximo para retornar los ganadores
    const puntajeMaximo = Math.max(...rankingResult.rows.map(u => parseInt(u.puntos_acumulados, 10)));
    
    // Obtener todos los usuarios con el puntaje máximo (manejo de empates para mostrar)
    const ganadores = rankingResult.rows.filter(u => parseInt(u.puntos_acumulados, 10) === puntajeMaximo);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // Borrar ganadores acumulados anteriores (se recalculan cada vez)
    await pool.query('DELETE FROM sudamericana_ganadores_acumulado');
    
    // Guardar el TOP 3 en la tabla (no solo el ganador)
    for (let i = 0; i < top3.length; i++) {
      await pool.query(
        `INSERT INTO sudamericana_ganadores_acumulado (usuario_id, puntaje)
         VALUES ($1, $2)`,
        [top3[i].id, parseInt(top3[i].puntos_acumulados, 10)]
      );
    }
    
    // Registrar notificación para usuarios
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores del acumulado
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2`,
        ['sudamericana', 'acumulado']
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'sudamericana', 
          'acumulado', 
          'ganador_acumulado',
          null, 
          JSON.stringify(ganadores.map(g => ({
            nombre: g.nombre,
            puntaje: puntajeMaximo,
            foto_perfil: g.foto_perfil
          }))), 
          mensajeNotificacion,
          '👑',
          '/sudamericana/clasificacion'
        ]
      );
      
      console.log(`✅ Notificación acumulado Sudamericana creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación acumulado Sudamericana:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // Retornar los ganadores
    res.json({
      tipo: 'acumulado',
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        foto_perfil: g.foto_perfil,
        puntaje: puntajeMaximo
      })),
      mensaje: ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`
    });
    
  } catch (error) {
    console.error('Error calculando ganadores acumulado Sudamericana:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Error calculando ganadores del ranking acumulado',
      details: error.message 
    });
  }
});

// GET: Obtener ganadores del ranking acumulado
router.get('/acumulado', async (req, res) => {
  try {
    // Verificar si la tabla existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sudamericana_ganadores_acumulado'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const result = await pool.query(`
      SELECT 
        sga.puntaje,
        sga.fecha_calculo,
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil
      FROM sudamericana_ganadores_acumulado sga
      INNER JOIN usuarios u ON sga.usuario_id = u.id
      ORDER BY u.nombre
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      foto_perfil: row.foto_perfil,
      puntaje: row.puntaje
    }));
    
    const mensaje = ganadores.length === 1 
      ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
      : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
    
    res.json({
      tipo: 'acumulado',
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores acumulado Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores del ranking acumulado' });
  }
});

// GET: Obtener resumen de títulos de todos los ganadores
router.get('/titulos', async (req, res) => {
  try {
    // Verificar si la tabla existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sudamericana_ganadores_jornada'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json([]);
    }
    
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM sudamericana_ganadores_jornada sgj
      JOIN usuarios u ON sgj.usuario_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo títulos Sudamericana:', error);
    res.status(500).json({ error: 'No se pudo obtener el resumen de títulos' });
  }
});

// POST: Calcular y guardar ganadores de una jornada específica
router.post('/:jornadaNumero', verifyToken, checkRole('admin'), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    // Verificar/crear tabla sudamericana_ganadores_jornada SI NO EXISTE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_ganadores_jornada (
        id SERIAL PRIMARY KEY,
        jornada_numero INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jornada_numero, usuario_id)
      )
    `);
    
    // 1. Obtener todos los usuarios activos en Sudamericana con sus fotos de perfil
    const usuariosResult = await pool.query(
      'SELECT id, nombre, foto_perfil FROM usuarios WHERE activo_sudamericana = true ORDER BY nombre'
    );
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos en Sudamericana' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos (usando p.jornada_id porque sp.jornada_id es NULL)
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(sp.puntos), 0) as puntos_partidos
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sp.usuario_id = $1 AND sj.numero = $2
      `, [usuario.id, jornadaNumero]);
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        foto_perfil: usuario.foto_perfil,
        puntaje: puntosPartidos
      });
    }
    
    // Verificar que haya datos
    if (puntosUsuarios.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos para esta jornada' });
    }
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM sudamericana_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    console.log(`📝 Guardando ${ganadores.length} ganador(es) para jornada ${jornadaNumero} Sudamericana`);
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO sudamericana_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 7. Registrar notificación para usuarios
    console.log(`🔔 Creando notificación para jornada ${jornadaNumero} Sudamericana...`);
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores de esta jornada
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2 AND jornada_numero = $3`,
        ['sudamericana', 'jornada', jornadaNumero]
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'sudamericana', 
          'jornada', 
          'ganador_jornada',
          jornadaNumero, 
          JSON.stringify(ganadores.map(g => ({
            nombre: g.nombre,
            puntaje: g.puntaje,
            foto_perfil: g.foto_perfil
          }))), 
          mensajeNotificacion,
          '🏆',
          `/sudamericana/clasificacion?jornada=${jornadaNumero}`
        ]
      );
      
      console.log(`✅ Notificación Sudamericana creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación Sudamericana:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;

    // 8. Retornar los ganadores
    res.json({
      jornadaNumero,
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: g.puntaje,
        foto_perfil: g.foto_perfil
      })),
      mensaje
    });
    
  } catch (error) {
    console.error('Error calculando ganadores Sudamericana:', error);
    console.error('Stack trace:', error.stack);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      error: 'Error calculando ganadores de la jornada',
      details: error.message 
    });
  }
});

// GET: Obtener ganadores de una jornada
router.get('/:jornadaNumero', async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválida' });
  }
  
  try {
    // Calcular ganadores DIRECTAMENTE desde el ranking (siempre actualizado)
    const rankingQuery = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      LEFT JOIN sudamericana_partidos p ON sp.partido_id = p.id
      LEFT JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = $1 AND u.activo_sudamericana = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COALESCE(SUM(sp.puntos), 0) > 0
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `;

    const ranking = await pool.query(rankingQuery, [jornadaNumero]);
    
    if (ranking.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    // Obtener el puntaje máximo
    const maxPuntaje = parseInt(ranking.rows[0].puntos_jornada);
    
    // Filtrar todos los que tienen el puntaje máximo (pueden ser varios en empate)
    const ganadores = ranking.rows
      .filter(row => parseInt(row.puntos_jornada) === maxPuntaje)
      .map(row => ({
        nombre: row.nombre,
        puntaje: maxPuntaje,
        foto_perfil: row.foto_perfil
      }));
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;
    
    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: new Date()
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

export default router;
