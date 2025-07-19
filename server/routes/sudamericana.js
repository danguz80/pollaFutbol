import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// Función helper para obtener clasificados reales basándose en los fixtures oficiales
async function obtenerClasificadosReales() {
  // Obtener todos los fixtures con sus datos reales
  const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
  
  // Construir diccionario basándose en los campos 'clasificado' y 'equipo_clasificado_real'
  const dic = {};
  
  for (const fixture of fixturesResult.rows) {
    const { clasificado, equipo_clasificado_real } = fixture;
    
    // Si hay un clasificado definido, mapear la sigla al equipo real
    if (clasificado && equipo_clasificado_real) {
      // Mapear la sigla (WP01, WO.A, etc.) al nombre real del equipo
      dic[clasificado] = equipo_clasificado_real;
    }
  }
  
  return dic;
}

// Función auxiliar para actualizar equipos en la ronda siguiente
async function actualizarEquiposRondaSiguiente(rondaActual, clasificados) {
  try {
    console.log(`🔄 [SUDAMERICANA] Actualizando equipos en ronda siguiente a ${rondaActual}`);
    
    // Mapeo de rondas y sus siglas
    const mapeoRondas = {
      'Knockout Round Play-offs': {
        siguiente: 'Octavos de Final',
        siglas: ['WP01', 'WP02', 'WP03', 'WP04', 'WP05', 'WP06', 'WP07', 'WP08']
      },
      'Octavos de Final': {
        siguiente: 'Cuartos de Final',
        siglas: ['WO.A', 'WO.B', 'WO.C', 'WO.D', 'WO.E', 'WO.F', 'WO.G', 'WO.H']
      },
      'Cuartos de Final': {
        siguiente: 'Semifinales',
        siglas: ['WC1', 'WC2', 'WC3', 'WC4']
      },
      'Semifinales': {
        siguiente: 'Final',
        siglas: ['WS1', 'WS2']
      }
    };

    const rondaInfo = mapeoRondas[rondaActual];
    if (!rondaInfo) {
      console.log(`⚠️  [SUDAMERICANA] No hay ronda siguiente para ${rondaActual}`);
      return;
    }

    const { siguiente, siglas } = rondaInfo;
    console.log(`📋 [SUDAMERICANA] Actualizando ${siguiente} con ${clasificados.length} equipos`);

    // Actualizar cada sigla con su equipo correspondiente
    for (let i = 0; i < Math.min(clasificados.length, siglas.length); i++) {
      const sigla = siglas[i];
      const equipo = clasificados[i];

      // Actualizar equipo_local donde coincida la sigla
      const updateLocal = await pool.query(
        'UPDATE sudamericana_fixtures SET equipo_local = $1 WHERE equipo_local = $2 AND ronda = $3',
        [equipo, sigla, siguiente]
      );

      // Actualizar equipo_visita donde coincida la sigla
      const updateVisita = await pool.query(
        'UPDATE sudamericana_fixtures SET equipo_visita = $1 WHERE equipo_visita = $2 AND ronda = $3',
        [equipo, sigla, siguiente]
      );

      if (updateLocal.rowCount > 0 || updateVisita.rowCount > 0) {
        console.log(`✅ [SUDAMERICANA] Actualizado ${sigla} → ${equipo} en ${siguiente}`);
      }
    }
    
  } catch (error) {
    console.error('❌ [SUDAMERICANA] Error actualizando ronda siguiente:', error);
  }
}

// GET /api/sudamericana/fixture/:ronda - Obtener partidos de una ronda específica, con nombres reales según avance de cruces y pronósticos del usuario
router.get('/fixture/:ronda', async (req, res) => {
  try {
    const { ronda } = req.params;
    const usuarioId = req.query.usuarioId || null;
    // 1. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 2. Si hay usuario, obtener sus pronósticos
    let pronos = [];
    if (usuarioId) {
      const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
      pronos = pronosRes.rows;
    }
    // 3. Calcular avance de cruces según el contexto
    let dicSiglas;
    if (usuarioId) {
      // Si hay usuario, usar sus pronósticos
      dicSiglas = calcularAvanceSiglas(fixture, pronos);
    } else {
      // Si no hay usuario (admin), usar clasificados reales
      dicSiglas = await obtenerClasificadosReales();
    }
    // 4. Filtrar partidos de la ronda y reemplazar nombres
    const partidosRonda = fixture.filter(f => f.ronda === ronda);
    const partidosConNombres = reemplazarSiglasPorNombres(partidosRonda, dicSiglas);
    res.json(Array.isArray(partidosConNombres) ? partidosConNombres : []);
  } catch (err) {
    res.json([]); // Siempre un array
  }
});

// PATCH /api/sudamericana/fixture/:ronda - Actualizar goles/bonus de los partidos de una ronda
router.patch('/fixture/:ronda', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { ronda } = req.params;
  const { partidos } = req.body;
  if (!Array.isArray(partidos) || partidos.length === 0) {
    return res.status(400).json({ error: 'No se recibieron partidos para actualizar' });
  }
  let actualizados = 0;
  try {
    for (const partido of partidos) {
      await pool.query(
        `UPDATE sudamericana_fixtures
         SET goles_local = $1, goles_visita = $2, penales_local = $3, penales_visita = $4, bonus = $5
         WHERE fixture_id = $6 AND ronda = $7`,
        [
          partido.golesLocal !== "" ? partido.golesLocal : null,
          partido.golesVisita !== "" ? partido.golesVisita : null,
          partido.penalesLocal !== undefined && partido.penalesLocal !== "" ? partido.penalesLocal : null,
          partido.penalesVisita !== undefined && partido.penalesVisita !== "" ? partido.penalesVisita : null,
          partido.bonus ?? 1,
          partido.id,
          ronda
        ]
      );
      actualizados++;
    }
    
    // === CALCULAR Y GUARDAR CLASIFICADOS REALES AUTOMÁTICAMENTE ===
    console.log(`🔄 [SUDAMERICANA] Calculando clasificados para ronda: ${ronda}`);
    
    try {
      // Obtener partidos de la ronda con resultados
      const { rows: partidosRonda } = await pool.query(
        `SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita
         FROM sudamericana_fixtures 
         WHERE ronda = $1 
         AND goles_local IS NOT NULL 
         AND goles_visita IS NOT NULL
         ORDER BY fixture_id ASC`,
        [ronda]
      );
      
      console.log(`📊 [SUDAMERICANA] Partidos con resultados en ${ronda}:`, partidosRonda.length);
      
      const clasificados = [];
      const crucesUnicos = new Set();
      
      // === PROCESAMIENTO ESPECIAL PARA LA FINAL ===
      if (ronda === 'Final') {
        console.log(`🏆 [SUDAMERICANA] Procesando Final (partido único)`);
        
        for (const partido of partidosRonda) {
          const esEquipoReal = (equipo) => equipo && !equipo.match(/^(WP|WO|WC|WS)\d*\.?[A-Z]*$/);
          
          if (!esEquipoReal(partido.equipo_local) || !esEquipoReal(partido.equipo_visita)) {
            console.log(`⏭️  [SUDAMERICANA] Saltando final con códigos: ${partido.equipo_local} vs ${partido.equipo_visita}`);
            continue;
          }
          
          console.log(`🏅 [SUDAMERICANA] Final: ${partido.equipo_local} ${partido.goles_local}-${partido.goles_visita} ${partido.equipo_visita} (pen: ${partido.penales_local || 0}-${partido.penales_visita || 0})`);
          
          let campeon = null;
          let subcampeon = null;
          
          // Determinar ganador de la final
          if (partido.goles_local > partido.goles_visita) {
            campeon = partido.equipo_local;
            subcampeon = partido.equipo_visita;
          } else if (partido.goles_visita > partido.goles_local) {
            campeon = partido.equipo_visita;
            subcampeon = partido.equipo_local;
          } else {
            // Empate: definir por penales
            if ((partido.penales_local || 0) > (partido.penales_visita || 0)) {
              campeon = partido.equipo_local;
              subcampeon = partido.equipo_visita;
            } else if ((partido.penales_visita || 0) > (partido.penales_local || 0)) {
              campeon = partido.equipo_visita;
              subcampeon = partido.equipo_local;
            }
          }
          
          if (campeon && subcampeon) {
            console.log(`🥇 [SUDAMERICANA] Campeón: ${campeon}`);
            console.log(`🥈 [SUDAMERICANA] Subcampeón: ${subcampeon}`);
            clasificados.push(campeon);   // Primer lugar
            clasificados.push(subcampeon); // Segundo lugar
          } else {
            console.log(`❌ [SUDAMERICANA] No se pudo determinar campeón de la final`);
          }
          
          break; // Solo procesar un partido de final
        }
        
      } else {
        // === PROCESAMIENTO NORMAL PARA OTRAS RONDAS (IDA Y VUELTA) ===
        for (const partido of partidosRonda) {
          // Solo procesar partidos con equipos reales
          const esEquipoReal = (equipo) => equipo && !equipo.match(/^(WP|WO|WC|WS)\d*\.?[A-Z]*$/);
          
          if (!esEquipoReal(partido.equipo_local) || !esEquipoReal(partido.equipo_visita)) {
            console.log(`⏭️  [SUDAMERICANA] Saltando partido con códigos: ${partido.equipo_local} vs ${partido.equipo_visita}`);
            continue;
          }
          
          // Crear identificador único del cruce
          const equipos = [partido.equipo_local, partido.equipo_visita].sort();
          const cruceId = `${equipos[0]}-vs-${equipos[1]}`;
          
          if (crucesUnicos.has(cruceId)) {
            console.log(`⏭️  [SUDAMERICANA] Cruce ya procesado: ${cruceId}`);
            continue;
          }
          crucesUnicos.add(cruceId);
          
          // Buscar partido de vuelta
          const partidoVuelta = partidosRonda.find(p => 
            p.fixture_id !== partido.fixture_id &&
            ((p.equipo_local === partido.equipo_visita && p.equipo_visita === partido.equipo_local))
          );
          
          if (!partidoVuelta) {
            console.log(`⚠️  [SUDAMERICANA] No se encontró partido de vuelta para: ${partido.equipo_local} vs ${partido.equipo_visita}`);
            continue;
          }
          
          console.log(`🏆 [SUDAMERICANA] Procesando cruce: ${partido.equipo_local} vs ${partido.equipo_visita}`);
          console.log(`   Ida: ${partido.goles_local}-${partido.goles_visita} (pen: ${partido.penales_local || 0}-${partido.penales_visita || 0})`);
          console.log(`   Vuelta: ${partidoVuelta.goles_local}-${partidoVuelta.goles_visita} (pen: ${partidoVuelta.penales_local || 0}-${partidoVuelta.penales_visita || 0})`);
          
          // Calcular resultado global
          let golesEquipo1 = partido.goles_local + partidoVuelta.goles_visita;
          let golesEquipo2 = partido.goles_visita + partidoVuelta.goles_local;
          let penalesEquipo1 = (partido.penales_local || 0) + (partidoVuelta.penales_visita || 0);
          let penalesEquipo2 = (partido.penales_visita || 0) + (partidoVuelta.penales_local || 0);
          
          console.log(`   Global: ${partido.equipo_local} ${golesEquipo1}-${golesEquipo2} ${partido.equipo_visita} (pen: ${penalesEquipo1}-${penalesEquipo2})`);
          
          // Determinar ganador
          let ganador = null;
          if (golesEquipo1 > golesEquipo2) {
            ganador = partido.equipo_local;
          } else if (golesEquipo2 > golesEquipo1) {
            ganador = partido.equipo_visita;
          } else {
            // Empate: definir por penales
            if (penalesEquipo1 > penalesEquipo2) {
              ganador = partido.equipo_local;
            } else if (penalesEquipo2 > penalesEquipo1) {
              ganador = partido.equipo_visita;
            }
          }
          
          if (ganador) {
            console.log(`✅ [SUDAMERICANA] Ganador: ${ganador}`);
            clasificados.push(ganador);
          } else {
            console.log(`❌ [SUDAMERICANA] No se pudo determinar ganador`);
          }
        }
      }
      
      console.log(`🎯 [SUDAMERICANA] Total clasificados calculados:`, clasificados);
      
      // Guardar en clasif_sud
      if (clasificados.length > 0) {
        await pool.query('DELETE FROM clasif_sud WHERE ronda = $1', [ronda]);
        console.log(`🗑️  [SUDAMERICANA] Eliminados clasificados anteriores de ${ronda}`);
        
        for (const equipo of clasificados) {
          await pool.query(
            'INSERT INTO clasif_sud (ronda, clasificados) VALUES ($1, $2)',
            [ronda, equipo]
          );
          console.log(`💾 [SUDAMERICANA] Guardado: ${equipo} en ${ronda}`);
        }

        // === ACTUALIZAR RONDA SIGUIENTE CON EQUIPOS REALES ===
        await actualizarEquiposRondaSiguiente(ronda, clasificados);
      }
      
    } catch (error) {
      console.error('❌ [SUDAMERICANA] Error calculando clasificados:', error);
    }
    
    res.json({ 
      mensaje: 'Resultados, bonus y clasificados guardados en la base de datos', 
      actualizados,
      clasificados: (await pool.query('SELECT COUNT(*) FROM clasif_sud WHERE ronda = $1', [ronda])).rows[0].count
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar partidos Sudamericana' });
  }
});

// GET /api/sudamericana/fixture (puede ser público, acepta ?ronda=...&usuarioId=...)
router.get('/fixture', async (req, res) => {
  try {
    const { ronda, usuarioId } = req.query;
    // 1. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 2. Si hay usuario, obtener sus pronósticos
    let pronos = [];
    if (usuarioId) {
      const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
      pronos = pronosRes.rows;
    }
    // 3. Calcular avance de cruces (si hay usuario, usa sus pronósticos)
    const dicSiglas = calcularAvanceSiglas(fixture, pronos);
    // 4. Filtrar partidos (por ronda si corresponde) y reemplazar nombres
    let partidos = fixture;
    if (ronda) partidos = partidos.filter(f => f.ronda === ronda);
    const partidosConNombres = reemplazarSiglasPorNombres(partidos, dicSiglas);
    res.json(Array.isArray(partidosConNombres) ? partidosConNombres : []);
  } catch (err) {
    res.json([]); // Siempre un array
  }
});

// GET /api/sudamericana/rondas - Todas las rondas únicas
router.get('/rondas', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    res.json(Array.isArray(result.rows) ? result.rows.map(r => r.ronda) : []);
  } catch (err) {
    res.json([]); // Siempre un array
  }
});

// GET /api/sudamericana/clasificados-reales - Obtener todos los clasificados reales por ronda
router.get('/clasificados-reales', async (req, res) => {
  try {
    const result = await pool.query('SELECT ronda, clasificados FROM clasif_sud ORDER BY ronda');
    
    // Organizar por ronda
    const clasificadosPorRonda = {};
    for (const row of result.rows) {
      if (!clasificadosPorRonda[row.ronda]) {
        clasificadosPorRonda[row.ronda] = [];
      }
      if (row.clasificados && row.clasificados.trim()) {
        clasificadosPorRonda[row.ronda].push(row.clasificados.trim());
      }
    }
    
    res.json(clasificadosPorRonda);
  } catch (err) {
    console.error('Error al obtener clasificados reales:', err);
    res.status(500).json({ error: 'Error al obtener clasificados reales' });
  }
});

export default router;
