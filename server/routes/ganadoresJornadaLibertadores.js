import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';

const router = express.Router();


// IMPORTANTE: Rutas específicas (/acumulado) ANTES de rutas con parámetros (/:jornadaNumero)

// POST: Calcular y guardar ganador del ranking acumulado TOTAL (todas las jornadas)
router.post('/acumulado', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    // Verificar/crear tabla libertadores_ganadores_acumulado
    await pool.query('DROP TABLE IF EXISTS libertadores_ganadores_acumulado CASCADE');
    await pool.query(`
      CREATE TABLE libertadores_ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabla libertadores_ganadores_acumulado recreada');
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas)
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.campeon, 0) + 
        COALESCE(puntos_campeon.subcampeon, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT lp.usuario_id, SUM(lp.puntos) as total
        FROM libertadores_pronosticos lp
        GROUP BY lp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT lpc.usuario_id, SUM(lpc.puntos) as total
        FROM libertadores_puntos_clasificacion lpc
        GROUP BY lpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
        FROM libertadores_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      WHERE u.activo = true
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `);
    
    if (rankingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos' });
    }
    
    // Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...rankingResult.rows.map(u => parseInt(u.puntos_acumulados, 10)));
    
    // Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = rankingResult.rows.filter(u => parseInt(u.puntos_acumulados, 10) === puntajeMaximo);
    
    console.log('Ganadores acumulado encontrados:', ganadores);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // Borrar ganadores anteriores (si existen)
    await pool.query('DELETE FROM libertadores_ganadores_acumulado');
    
    // Guardar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_acumulado (usuario_id, puntaje)
         VALUES ($1, $2)`,
        [ganador.id, puntajeMaximo]
      );
    }
    
    // Retornar los ganadores
    res.json({
      tipo: 'acumulado',
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: puntajeMaximo
      })),
      mensaje: ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`
    });
    
  } catch (error) {
    console.error('Error calculando ganadores acumulado:', error);
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
    const result = await pool.query(`
      SELECT 
        lga.puntaje,
        lga.fecha_calculo,
        u.id as usuario_id,
        u.nombre
      FROM libertadores_ganadores_acumulado lga
      INNER JOIN usuarios u ON lga.usuario_id = u.id
      ORDER BY u.nombre
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
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
    console.error('Error obteniendo ganadores acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores del ranking acumulado' });
  }
});


// GET: Obtener resumen de títulos de todos los ganadores
router.get('/titulos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM libertadores_ganadores_jornada lgj
      JOIN usuarios u ON lgj.usuario_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo títulos:', error);
    res.status(500).json({ error: 'No se pudo obtener el resumen de títulos' });
  }
});


// IMPORTANTE: Rutas específicas ANTES de rutas con parámetros

// POST: Calcular y guardar ganadores de una jornada específica
router.post('/:jornadaNumero', verifyToken, checkRole('admin'), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    // Verificar/crear tabla libertadores_ganadores_jornada SI NO EXISTE
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
    
    console.log('✅ Tabla libertadores_ganadores_jornada verificada');
    
    // Verificar/crear tabla libertadores_puntos_clasificacion
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_puntos_clasificacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        partido_id INTEGER NOT NULL,
        jornada_numero INTEGER NOT NULL,
        equipo_clasificado VARCHAR(100) NOT NULL,
        fase_clasificado VARCHAR(50) NOT NULL,
        puntos INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, partido_id, jornada_numero)
      )
    `);
    
    // 1. Obtener todos los usuarios activos
    const usuariosResult = await pool.query(
      'SELECT id, nombre FROM usuarios WHERE activo = true ORDER BY nombre'
    );
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(lp.puntos), 0) as puntos_partidos
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        WHERE lp.usuario_id = $1 AND lj.numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Puntos de clasificación (equipos que avanzan)
      const puntosClasificacionResult = await pool.query(`
        SELECT COALESCE(SUM(puntos), 0) as puntos_clasificacion
        FROM libertadores_puntos_clasificacion
        WHERE usuario_id = $1 AND jornada_numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Para jornada 10 (FINAL), también incluir puntos de campeón y subcampeón
      let puntosCampeonSubcampeon = 0;
      if (jornadaNumero === 10) {
        const puntosFinalesResult = await pool.query(`
          SELECT 
            COALESCE(SUM(puntos_campeon), 0) + COALESCE(SUM(puntos_subcampeon), 0) as puntos_finales
          FROM libertadores_predicciones_campeon
          WHERE usuario_id = $1
        `, [usuario.id]);
        
        puntosCampeonSubcampeon = puntosFinalesResult.rows[0].puntos_finales || 0;
      }
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      const puntosClasificacion = parseInt(puntosClasificacionResult.rows[0].puntos_clasificacion || 0, 10);
      const puntosCampeonSubcampeonNum = parseInt(puntosCampeonSubcampeon || 0, 10);
      const puntosTotal = puntosPartidos + puntosClasificacion + puntosCampeonSubcampeonNum;
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        puntaje: puntosTotal
      });
    }
    
    // Verificar que haya datos
    if (puntosUsuarios.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos para esta jornada' });
    }
    
    console.log('Puntos usuarios calculados:', puntosUsuarios);
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    console.log('Puntaje máximo:', puntajeMaximo);
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    console.log('Ganadores encontrados:', ganadores);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 7. Retornar los ganadores
    res.json({
      jornadaNumero,
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: g.puntaje
      })),
      mensaje: ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`
    });
    
  } catch (error) {
    console.error('Error calculando ganadores:', error);
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
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        lgj.jornada_numero,
        lgj.puntaje,
        lgj.fecha_calculo,
        u.id as usuario_id,
        u.nombre
      FROM libertadores_ganadores_jornada lgj
      INNER JOIN usuarios u ON lgj.usuario_id = u.id
      WHERE lgj.jornada_numero = $1
      ORDER BY u.nombre
    `, [jornadaNumero]);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      puntaje: row.puntaje
    }));
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;
    
    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});


export default router;
