import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { calcularTablaOficial, calcularTablaUsuario } from '../utils/calcularClasificadosSudamericana.js';

const router = express.Router();

// Función auxiliar para determinar el signo del resultado
function getSigno(golesLocal, golesVisita) {
  if (golesLocal > golesVisita) return 1;  // Victoria local
  if (golesLocal < golesVisita) return 2;  // Victoria visita
  return 'X';  // Empate
}

// Función auxiliar para determinar la fase según el número de jornada
function getFaseDeJornada(jornadaNumero) {
  if (jornadaNumero <= 6) return 'FASE DE GRUPOS';
  if (jornadaNumero <= 8) return 'OCTAVOS';
  if (jornadaNumero === 9) return 'CUARTOS';
  if (jornadaNumero === 10) return 'SEMIFINALES';
  return 'FASE DE GRUPOS';
}

// POST /api/sudamericana-calcular/puntos - Calcular y asignar puntos a todos los pronósticos (o de una jornada específica)
router.post('/puntos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.body; // Jornada opcional
    console.log(`🎯 INICIO calcular puntos - Jornada: ${jornadaNumero || 'TODAS'}`);
    
    // Obtener reglas de puntuación
    const reglasResult = await pool.query('SELECT * FROM libertadores_puntuacion ORDER BY puntos DESC');
    const reglas = reglasResult.rows;

    // Construir consulta con filtro opcional de jornada
    let query = `
      SELECT 
        sp.id,
        sp.usuario_id,
        sp.goles_local as pronostico_local,
        sp.goles_visita as pronostico_visita,
        p.id as partido_id,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        p.nombre_local,
        p.nombre_visita,
        p.bonus,
        sj.numero as jornada_numero
      FROM sudamericana_pronosticos sp
      INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
      INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL`;
    
    const params = [];
    if (jornadaNumero) {
      query += ` AND sj.numero = $1`;
      params.push(jornadaNumero);
    }
    
    const pronosticosResult = await pool.query(query, params);

    let pronosticosActualizados = 0;
    let puntosAsignados = 0;

    // Calcular puntos para cada pronóstico
    for (const pronostico of pronosticosResult.rows) {
      const {
        id,
        usuario_id,
        pronostico_local,
        pronostico_visita,
        partido_id,
        resultado_local,
        resultado_visita,
        nombre_local,
        nombre_visita,
        bonus,
        jornada_numero
      } = pronostico;

      // Bonus del partido (x1, x2, x3, etc.)
      const bonusMultiplicador = bonus || 1;

      // Determinar la fase según el número de jornada
      const fase = getFaseDeJornada(jornada_numero);
      
      // Obtener reglas de puntuación para esta fase
      const puntosSigno = reglas.find(r => r.fase === fase && r.concepto.includes('Signo 1X2'))?.puntos || 1;
      const puntosDiferencia = reglas.find(r => r.fase === fase && r.concepto.includes('Diferencia de goles'))?.puntos || 3;
      const puntosExacto = reglas.find(r => r.fase === fase && r.concepto.includes('Resultado exacto'))?.puntos || 5;

      let puntosGanados = 0;

      // 1. Verificar resultado exacto (mayor puntuación)
      if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
        puntosGanados = puntosExacto;
      }
      // 2. Verificar diferencia de goles
      else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
        // Además, debe coincidir el signo (quién gana)
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosDiferencia;
        }
      }
      // 3. Verificar solo signo 1X2
      else {
        const signoPronostico = getSigno(pronostico_local, pronostico_visita);
        const signoResultado = getSigno(resultado_local, resultado_visita);
        
        if (signoPronostico === signoResultado) {
          puntosGanados = puntosSigno;
        }
      }

      // Multiplicar puntos por el bonus del partido
      const puntosFinales = puntosGanados * bonusMultiplicador;

      // Actualizar puntos en la base de datos
      await pool.query(
        'UPDATE sudamericana_pronosticos SET puntos = $1 WHERE id = $2',
        [puntosFinales, id]
      );

      if (puntosFinales > 0) {
        pronosticosActualizados++;
        puntosAsignados += puntosFinales;
      }
    }

    // Para jornada 6: calcular y guardar puntos de clasificación
    let puntosClasificacion = 0;
    if (jornadaNumero == 6) {  // Usar == en lugar de === por si viene como string
      
      // Verificar/crear tabla sudamericana_puntos_clasificacion
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sudamericana_puntos_clasificacion (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          partido_id INTEGER,
          jornada_numero INTEGER NOT NULL,
          equipo_clasificado VARCHAR(100) NOT NULL,
          fase_clasificado VARCHAR(50) NOT NULL,
          puntos INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(usuario_id, partido_id, jornada_numero)
        )
      `);
      
      // Calcular clasificados oficiales (1ero y 2do de cada grupo)
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const primerosOficiales = {};
      const segundosOficiales = {};
      
      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        console.log(`🔍 DEBUG J6 - Grupo ${grupo} tabla oficial:`, tabla.slice(0, 3));
        if (tabla.length >= 1) {
          primerosOficiales[grupo] = tabla[0].nombre;
        }
        if (tabla.length >= 2) {
          segundosOficiales[grupo] = tabla[1].nombre;
        }
      }
      console.log('🔍 DEBUG J6 - Primeros oficiales:', primerosOficiales);
      console.log('🔍 DEBUG J6 - Segundos oficiales:', segundosOficiales);
      
      // Para cada usuario, calcular sus aciertos
      const usuariosRes = await pool.query(`
        SELECT DISTINCT sp.usuario_id
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
        WHERE j.numero = 6
      `);
      
      for (const {usuario_id} of usuariosRes.rows) {
        console.log(`\n🔍 DEBUG J6 - Procesando usuario_id: ${usuario_id}`);
        let puntosClasifUsuario = 0;
        
        // Primero eliminar TODOS los registros existentes de clasificación J6
        await pool.query(
          `DELETE FROM sudamericana_puntos_clasificacion 
           WHERE usuario_id = $1 
           AND jornada_numero = 6`,
          [usuario_id]
        );
        
        for (const grupo of grupos) {
          try {
            const tablaUsuario = await calcularTablaUsuario(usuario_id, grupo, jornadasNumeros);
            console.log(`🔍 DEBUG J6 - Usuario ${usuario_id} Grupo ${grupo} tabla:`, tablaUsuario.slice(0, 2).map(e => ({nombre: e.nombre, puntos: e.puntos})));
            
            // Verificar 1er lugar (Octavos) - INSERTAR SIEMPRE con 0 o 2 puntos
            if (tablaUsuario.length >= 1) {
              const primeroUsuario = tablaUsuario[0].nombre;
              const primeroOficial = primerosOficiales[grupo];
              console.log(`🔍 DEBUG J6 - Grupo ${grupo} 1ero: Usuario=${primeroUsuario} vs Oficial=${primeroOficial}`);
              
              const partidoIdFicticio = -(1000 + grupo.charCodeAt(0) * 10);
              const puntosOctavos = (primeroOficial && primeroUsuario === primeroOficial) ? 2 : 0;
              
              if (puntosOctavos > 0) {
                console.log(`✅ ACIERTO 1ero Grupo ${grupo}! +2 puntos`);
                puntosClasifUsuario += 2;
                puntosClasificacion += 2;
              }
              
              // INSERTAR SIEMPRE (igual que Libertadores)
              await pool.query(`
                INSERT INTO sudamericana_puntos_clasificacion 
                (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos, equipo_oficial)
                VALUES ($1, $2, 6, $3, $4, $5, $6)
              `, [usuario_id, partidoIdFicticio, primeroUsuario, `OCTAVOS_GRUPO_${grupo}`, puntosOctavos, primeroOficial]);
            }
            
            // Verificar 2do lugar (Playoffs) - INSERTAR SIEMPRE con 0 o 2 puntos
            if (tablaUsuario.length >= 2) {
              const segundoUsuario = tablaUsuario[1].nombre;
              const segundoOficial = segundosOficiales[grupo];
              console.log(`🔍 DEBUG J6 - Grupo ${grupo} 2do: Usuario=${segundoUsuario} vs Oficial=${segundoOficial}`);
              
              const partidoIdFicticioPlayoffs = -(2000 + grupo.charCodeAt(0));
              const puntosPlayoffs = (segundoOficial && segundoUsuario === segundoOficial) ? 2 : 0;
              
              if (puntosPlayoffs > 0) {
                console.log(`✅ ACIERTO 2do Grupo ${grupo}! +2 puntos`);
                puntosClasifUsuario += 2;
                puntosClasificacion += 2;
              }
              
              // INSERTAR SIEMPRE (igual que Libertadores)
              await pool.query(`
                INSERT INTO sudamericana_puntos_clasificacion 
                (usuario_id, partido_id, jornada_numero, equipo_clasificado, fase_clasificado, puntos, equipo_oficial)
                VALUES ($1, $2, 6, $3, $4, $5, $6)
              `, [usuario_id, partidoIdFicticioPlayoffs, segundoUsuario, `PLAYOFFS_GRUPO_${grupo}`, puntosPlayoffs, segundoOficial]);
            }
          } catch (error) {
            console.error(`  ❌ Error grupo ${grupo}:`, error.message);
          }
        }
        console.log(`🎯 DEBUG J6 - Usuario ${usuario_id} TOTAL puntos clasificación: ${puntosClasifUsuario}`);
      }
    }

    console.log(`✅ Puntos calculados: ${pronosticosActualizados} pronósticos actualizados, ${puntosAsignados} puntos totales asignados`);

    res.json({
      mensaje: jornadaNumero 
        ? `✅ Puntajes de jornada ${jornadaNumero} calculados correctamente`
        : '✅ Puntajes calculados correctamente',
      total_pronosticos: pronosticosResult.rows.length,
      pronosticos_con_puntos: pronosticosActualizados,
      puntos_totales_asignados: puntosAsignados,
      puntos_clasificacion_asignados: puntosClasificacion
    });

  } catch (error) {
    console.error('❌ Error al calcular puntos:', error);
    res.status(500).json({ 
      error: 'Error al calcular puntos',
      detalles: error.message 
    });
  }
});

export default router;
