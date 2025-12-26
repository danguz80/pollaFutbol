import { pool } from '../db/pool.js';

/**
 * Script para calcular ganadores de todas las jornadas cerradas de Libertadores
 * Ejecutar con: node server/scripts/calcular_ganadores_libertadores.js
 */

async function calcularGanadoresJornada(jornadaNumero) {
  console.log(`\n📊 Calculando ganadores de Jornada ${jornadaNumero}...`);
  
  try {
    // 1. Obtener todos los usuarios activos
    const usuariosResult = await pool.query(
      'SELECT id, nombre FROM usuarios WHERE activo = true ORDER BY nombre'
    );
    
    if (usuariosResult.rows.length === 0) {
      console.log('❌ No hay usuarios activos');
      return;
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
      
      if (puntosTotal > 0) {
        puntosUsuarios.push({
          usuario_id: usuario.id,
          nombre: usuario.nombre,
          puntaje: puntosTotal
        });
      }
    }
    
    if (puntosUsuarios.length === 0) {
      console.log('⚠️  No hay usuarios con puntos en esta jornada');
      return;
    }
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    console.log(`🏆 Ganador(es) con ${puntajeMaximo} puntos: ${ganadores.map(g => g.nombre).join(', ')}`);
    
    // 5. Verificar si ya existen ganadores para esta jornada
    const existentes = await pool.query(
      'SELECT COUNT(*) as count FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    if (existentes.rows[0].count > 0) {
      console.log('⚠️  Ya existen ganadores para esta jornada. Reemplazando...');
      await pool.query(
        'DELETE FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
        [jornadaNumero]
      );
    }
    
    // 6. Guardar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    console.log('✅ Ganadores guardados correctamente');
    
  } catch (error) {
    console.error(`❌ Error calculando ganadores de jornada ${jornadaNumero}:`, error);
  }
}

async function main() {
  console.log('🚀 Iniciando cálculo de ganadores de Libertadores...\n');
  
  try {
    // Verificar/crear tabla libertadores_ganadores_jornada
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
    
    console.log('✅ Tabla libertadores_ganadores_jornada verificada\n');
    
    // Obtener todas las jornadas cerradas
    const jornadasResult = await pool.query(`
      SELECT numero, nombre, cerrada
      FROM libertadores_jornadas
      WHERE cerrada = true
      ORDER BY numero
    `);
    
    if (jornadasResult.rows.length === 0) {
      console.log('⚠️  No hay jornadas cerradas para calcular ganadores');
      await pool.end();
      return;
    }
    
    console.log(`📋 Se encontraron ${jornadasResult.rows.length} jornadas cerradas\n`);
    
    // Calcular ganadores de cada jornada cerrada
    for (const jornada of jornadasResult.rows) {
      await calcularGanadoresJornada(jornada.numero);
    }
    
    // Mostrar resumen final
    console.log('\n📊 RESUMEN DE GANADORES:');
    const resumenResult = await pool.query(`
      SELECT u.nombre, COUNT(*) as titulos
      FROM libertadores_ganadores_jornada lgj
      JOIN usuarios u ON lgj.usuario_id = u.id
      GROUP BY u.id, u.nombre
      ORDER BY titulos DESC, u.nombre
    `);
    
    console.log('\n👑 Tabla de Campeones:');
    resumenResult.rows.forEach(row => {
      const estrella = '⭐'.repeat(parseInt(row.titulos));
      console.log(`   ${estrella} ${row.nombre} - ${row.titulos} ${row.titulos === '1' ? 'título' : 'títulos'}`);
    });
    
    console.log('\n✅ ¡Cálculo completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
  } finally {
    await pool.end();
  }
}

main();
