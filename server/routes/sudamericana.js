import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// Función helper para obtener clasificados reales basándose en los fixtures oficiales
async function obtenerClasificadosReales() {
  // Obtener clasificados reales desde la tabla clasif_sud con sus siglas
  const clasificadosResult = await pool.query('SELECT ronda, clasificados, sigla FROM clasif_sud ORDER BY ronda, id');
  
  // Construir diccionario de siglas basándose en los clasificados reales
  const dic = {};
  
  // Mapear siglas a equipos reales usando los datos de la base de datos
  for (const row of clasificadosResult.rows) {
    if (row.sigla && row.clasificados) {
      dic[row.sigla] = row.clasificados.trim();
    }
  }
  
  console.log('🔍 [SUDAMERICANA] Diccionario clasificados reales:', dic);
  
  return dic;
}

// Función para obtener la posición de un equipo en las tablas unificadas
async function obtenerPosicionEquipo(nombreEquipo) {
  try {
    console.log(`🔍 [SUDAMERICANA] Buscando posición para: ${nombreEquipo}`);

    // Para equipos específicos con problemas conocidos
    const EQUIPOS_ESPECIALES = {
      'Atletico-MG': ['Atletico MG', 'Atlético MG', 'Atlético-MG', 'Atlético Mineiro'],
      'Bolívar': ['Bolivar', 'Club Bolívar', 'Club Bolivar'],
    };

    // Si el equipo está en la lista de especiales, preparar búsquedas alternativas
    let nombresAlternativos = [];
    Object.entries(EQUIPOS_ESPECIALES).forEach(([nombre, alternativas]) => {
      if (nombreEquipo === nombre || alternativas.includes(nombreEquipo)) {
        // Agregar el nombre base y todas las alternativas
        nombresAlternativos.push(nombre);
        nombresAlternativos.push(...alternativas);
      }
    });

    // Si no hay alternativas específicas, solo usar el nombre original
    if (nombresAlternativos.length === 0) {
      nombresAlternativos = [nombreEquipo];
    }

    console.log(`🔄 [SUDAMERICANA] Alternativas: ${nombresAlternativos.join(', ')}`);

    // Buscar en primeros_sud (posiciones 1-8)
    for (const nombre of nombresAlternativos) {
      const primerosSud = await pool.query('SELECT pos FROM primeros_sud WHERE equipo = $1', [nombre]);
      if (primerosSud.rows.length > 0) {
        console.log(`✅ [SUDAMERICANA] ${nombre} encontrado en primeros_sud, posición: ${primerosSud.rows[0].pos}`);
        return primerosSud.rows[0].pos;
      }
    }

    // Buscar en segundos_sud (posiciones 9-16)
    for (const nombre of nombresAlternativos) {
      const segundosSud = await pool.query('SELECT pos FROM segundos_sud WHERE equipo = $1', [nombre]);
      if (segundosSud.rows.length > 0) {
        console.log(`✅ [SUDAMERICANA] ${nombre} encontrado en segundos_sud, posición: ${segundosSud.rows[0].pos}`);
        return segundosSud.rows[0].pos;
      }
    }

    // Buscar en terceros_lib (posiciones 17-24)
    for (const nombre of nombresAlternativos) {
      const tercerosLib = await pool.query('SELECT pos FROM terceros_lib WHERE equipo = $1', [nombre]);
      if (tercerosLib.rows.length > 0) {
        console.log(`✅ [SUDAMERICANA] ${nombre} encontrado en terceros_lib, posición: ${tercerosLib.rows[0].pos}`);
        return tercerosLib.rows[0].pos;
      }
    }

    // POSICIONES PREDETERMINADAS PARA EQUIPOS ESPECÍFICOS
    const POSICIONES_PREDETERMINADAS = {
      'Atletico-MG': 11,  // Posición conocida de Atletico-MG
      'Bolívar': 21,      // Posición conocida de Bolívar
    };

    if (POSICIONES_PREDETERMINADAS[nombreEquipo]) {
      console.log(`⚠️ [SUDAMERICANA] Usando posición predeterminada para ${nombreEquipo}: ${POSICIONES_PREDETERMINADAS[nombreEquipo]}`);
      return POSICIONES_PREDETERMINADAS[nombreEquipo];
    }

    // Si no se encuentra, retornar posición muy alta (baja prioridad)
    console.log(`❌ [SUDAMERICANA] No se encontró posición para ${nombreEquipo}, asignando 999`);
    return 999;
  } catch (error) {
    console.error('❌ [SUDAMERICANA] Error obteniendo posición del equipo:', error);
    return 999;
  }
}

// Función para aplicar privilegios de local/visitante basado en posiciones
async function aplicarPrivilegiosLocalVisitante(ronda, equipos) {
  if (!equipos || equipos.length < 2) return equipos;

  try {
    // Para cada par de equipos, determinar quién tiene mejor posición
    const equiposConPosicion = await Promise.all(
      equipos.map(async (equipo) => ({
        equipo,
        posicion: await obtenerPosicionEquipo(equipo)
      }))
    );

    // Si solo hay 2 equipos (final), determinar quién juega de local
    if (equipos.length === 2 && ronda === 'Final') {
      const [equipo1, equipo2] = equiposConPosicion;
      
      // El de mejor posición (menor número) juega de local
      if (equipo1.posicion < equipo2.posicion) {
        return [equipo1.equipo, equipo2.equipo]; // equipo1 de local
      } else {
        return [equipo2.equipo, equipo1.equipo]; // equipo2 de local
      }
    }

    // Para rondas de ida y vuelta, ordenar por posición para determinar privilegios
    equiposConPosicion.sort((a, b) => a.posicion - b.posicion);
    return equiposConPosicion.map(e => e.equipo);

  } catch (error) {
    console.error('❌ [SUDAMERICANA] Error aplicando privilegios:', error);
    return equipos;
  }
}

// Función auxiliar para actualizar equipos en la ronda siguiente con privilegios de local/visitante
async function actualizarEquiposRondaSiguiente(rondaActual, clasificados) {
  try {
    
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
      return;
    }

    const { siguiente, siglas } = rondaInfo;

    // Obtener los datos de clasif_sud para mapear correctamente
    const { rows: clasificadosData } = await pool.query(
      'SELECT clasificados FROM clasif_sud WHERE ronda = $1 ORDER BY id ASC',
      [rondaActual]
    );

    if (clasificadosData.length === 0) {
      console.log(`⚠️ [SUDAMERICANA] No hay clasificados guardados para ${rondaActual}`);
      return;
    }

    // Crear mapeo correcto basándose en los fixtures y la columna clasificado
    // En lugar de usar orden secuencial, necesitamos mapear qué equipo real corresponde a cada sigla
    const mapeoSiglaEquipo = {};
    
    // Obtener fixtures de la ronda actual para entender el mapeo correcto
    const { rows: fixturesRondaActual } = await pool.query(
      'SELECT DISTINCT clasificado, equipo_local, equipo_visita FROM sudamericana_fixtures WHERE ronda = $1',
      [rondaActual]
    );
    
    console.log(`🔍 [SUDAMERICANA] Fixtures de ${rondaActual}:`, fixturesRondaActual);
    
    // Para cada fixture de la ronda actual, determinar qué equipo clasificó a qué sigla
    for (const fixture of fixturesRondaActual) {
      const siglaDestino = fixture.clasificado;
      
      // Buscar el equipo que clasificó de este cruce en clasif_sud
      const equipoCorrespondiente = clasificadosData.find(clasificado => {
        // El equipo debe participar en este cruce
        return (clasificado.clasificados === fixture.equipo_local || 
                clasificado.clasificados === fixture.equipo_visita ||
                // También considerar que el equipo puede estar representado por WP en el fixture
                fixture.equipo_local.startsWith('WP') || 
                fixture.equipo_visita.startsWith('WP'));
      });
      
      if (equipoCorrespondiente) {
        mapeoSiglaEquipo[siglaDestino] = equipoCorrespondiente.clasificados;
      }
    }
    
    // Si el mapeo anterior no funcionó, usar el enfoque basado en clasif_sud directamente
    if (Object.keys(mapeoSiglaEquipo).length === 0) {
      console.log(`⚠️ [SUDAMERICANA] Mapeo por fixtures falló, usando mapeo directo`);
      
      // Mapeo directo: cada equipo clasificado va a su sigla correspondiente según su cruce
      const mapeoEquipoASigla = {};
      
      // Construir mapeo inverso: equipo → sigla basándose en los fixtures
      for (const fixture of fixturesRondaActual) {
        const siglaDestino = fixture.clasificado;
        
        // Determinar qué equipos participan en este cruce
        let equiposDelCruce = [fixture.equipo_local, fixture.equipo_visita];
        
        // Si hay WP, necesitamos resolverlo desde knockout
        for (let i = 0; i < equiposDelCruce.length; i++) {
          if (equiposDelCruce[i].startsWith('WP')) {
            // Buscar qué equipo real representa esta sigla WP en clasif_sud de knockout
            const { rows: knockoutData } = await pool.query(
              'SELECT clasificados FROM clasif_sud WHERE ronda = $1 ORDER BY id ASC',
              ['Knockout Round Play-offs']
            );
            
            const wpIndex = parseInt(equiposDelCruce[i].replace('WP', '').replace('0', '')) - 1;
            if (knockoutData[wpIndex]) {
              equiposDelCruce[i] = knockoutData[wpIndex].clasificados;
            }
          }
        }
        
        console.log(`🎯 [SUDAMERICANA] Cruce ${siglaDestino}: ${equiposDelCruce.join(' vs ')}`);
        
        // Ver cuál de estos equipos está en clasif_sud (el que clasificó)
        for (const clasificado of clasificadosData) {
          if (equiposDelCruce.includes(clasificado.clasificados)) {
            mapeoSiglaEquipo[siglaDestino] = clasificado.clasificados;
            console.log(`✅ [SUDAMERICANA] ${siglaDestino} = ${clasificado.clasificados}`);
            break;
          }
        }
      }
    }

    console.log(`📋 [SUDAMERICANA] Mapeo ${rondaActual} → ${siguiente}:`, mapeoSiglaEquipo);

    // Aplicar privilegios de local/visitante solo para cuartos en adelante
    if (['Cuartos de Final', 'Semifinales'].includes(siguiente)) {
      console.log(`🏆 [SUDAMERICANA] Aplicando privilegios para ${siguiente}`);
      
      // Obtener los fixtures de la ronda siguiente para ver los cruces
      const { rows: fixturesSiguiente } = await pool.query(
        'SELECT * FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY fixture_id ASC',
        [siguiente]
      );
      
      // Procesar cruces por pares y aplicar privilegios
      for (let i = 0; i < fixturesSiguiente.length; i += 2) {
        const partidoIda = fixturesSiguiente[i];
        const partidoVuelta = fixturesSiguiente[i + 1];
        
        if (!partidoIda || !partidoVuelta) continue;
        
        // Obtener las siglas originales del cruce (antes de reemplazar)
        const siglaLocal = partidoIda.equipo_local;
        const siglaVisita = partidoIda.equipo_visita;
        
        console.log(`🔍 [SUDAMERICANA] Procesando cruce: ${siglaLocal} vs ${siglaVisita}`);
        
        // Buscar equipos reales usando las siglas
        const equipoLocal = mapeoSiglaEquipo[siglaLocal];
        const equipoVisita = mapeoSiglaEquipo[siglaVisita];
        
        if (!equipoLocal || !equipoVisita) {
          console.log(`⚠️ [SUDAMERICANA] No se encontraron equipos para siglas ${siglaLocal} (${equipoLocal}) vs ${siglaVisita} (${equipoVisita})`);
          // Si no podemos mapear, intentar mapeo directo si ya están los nombres reales
          const equipoLocalFinal = equipoLocal || siglaLocal;
          const equipoVisitaFinal = equipoVisita || siglaVisita;
          
          // Actualizar con nombres reales si están disponibles
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoLocalFinal, equipoVisitaFinal, partidoIda.fixture_id]
          );
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoVisitaFinal, equipoLocalFinal, partidoVuelta.fixture_id]
          );
          continue;
        }
        
        console.log(`✅ [SUDAMERICANA] Mapeo encontrado: ${siglaLocal} → ${equipoLocal}, ${siglaVisita} → ${equipoVisita}`);
        
        // Determinar privilegios basado en posiciones
        const posicionLocal = await obtenerPosicionEquipo(equipoLocal);
        const posicionVisita = await obtenerPosicionEquipo(equipoVisita);
        
        // El de mejor posición (menor número) cierra de local
        // Registrar qué equipo tiene privilegio para cerrar de local
        if (posicionLocal < posicionVisita) {
          console.log(`🏠 [SUDAMERICANA] ${equipoLocal} (pos.${posicionLocal}) tiene privilegio para cerrar de local vs ${equipoVisita} (pos.${posicionVisita})`);
        } else {
          console.log(`🏠 [SUDAMERICANA] ${equipoVisita} (pos.${posicionVisita}) tiene privilegio para cerrar de local vs ${equipoLocal} (pos.${posicionLocal})`);
        }
        
        // Actualizar los fixtures con los equipos reales y privilegios aplicados
        // Asegurarse que el partido de vuelta (fixture_id mayor) tenga como local al equipo con mejor posición
        if (posicionLocal < posicionVisita) {
          // El equipo "local" tiene mejor posición, debería cerrar de local en el partido de vuelta
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoVisita, equipoLocal, partidoIda.fixture_id]
          );
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoLocal, equipoVisita, partidoVuelta.fixture_id]
          );
        } else {
          // El equipo "visita" tiene mejor posición, debería cerrar de local en el partido de vuelta
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoLocal, equipoVisita, partidoIda.fixture_id]
          );
          await pool.query(
            'UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3',
            [equipoVisita, equipoLocal, partidoVuelta.fixture_id]
          );
        }
        
        console.log(`🔄 [SUDAMERICANA] Cruce actualizado: IDA: ${equipoLocal} vs ${equipoVisita} o ${equipoVisita} vs ${equipoLocal} (según privilegio)`);
      }
    } else if (siguiente === 'Final') {
      // Para la final, aplicar privilegios de local único
      const equiposArray = Object.values(mapeoSiglaEquipo);
      const clasificadosOrdenados = await aplicarPrivilegiosLocalVisitante(siguiente, equiposArray);
      console.log(`🏆 [SUDAMERICANA] Final - privilegios aplicados:`, clasificadosOrdenados);
      
      // Actualizar la final con privilegios
      for (let i = 0; i < Math.min(clasificadosOrdenados.length, siglas.length); i++) {
        const sigla = siglas[i];
        const equipo = clasificadosOrdenados[i];

        await pool.query(
          'UPDATE sudamericana_fixtures SET equipo_local = $1 WHERE equipo_local = $2 AND ronda = $3',
          [equipo, sigla, siguiente]
        );
        await pool.query(
          'UPDATE sudamericana_fixtures SET equipo_visita = $1 WHERE equipo_visita = $2 AND ronda = $3',
          [equipo, sigla, siguiente]
        );
      }
    } else {
      // Para octavos (sin privilegios especiales, solo mapeo directo)
      for (const [sigla, equipo] of Object.entries(mapeoSiglaEquipo)) {
        await pool.query(
          'UPDATE sudamericana_fixtures SET equipo_local = $1 WHERE equipo_local = $2 AND ronda = $3',
          [equipo, sigla, siguiente]
        );
        await pool.query(
          'UPDATE sudamericana_fixtures SET equipo_visita = $1 WHERE equipo_visita = $2 AND ronda = $3',
          [equipo, sigla, siguiente]
        );
        
        console.log(`✅ [SUDAMERICANA] ${sigla} → ${equipo} en ${siguiente}`);
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
    // 4. Filtrar partidos de la ronda y enviarlos TAL CUAL están en la base de datos
    const partidosRonda = fixture.filter(f => f.ronda === ronda);
    // No usar reemplazarSiglasPorNombres - enviar los datos originales sin modificar
    res.json(Array.isArray(partidosRonda) ? partidosRonda : []);
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
      
      const clasificados = [];
      const crucesUnicos = new Set();
      
      // === PROCESAMIENTO ESPECIAL PARA LA FINAL ===
      if (ronda === 'Final') {
        
        for (const partido of partidosRonda) {
          const esEquipoReal = (equipo) => equipo && !equipo.match(/^(WP|WO|WC|WS)\d*\.?[A-Z]*$/);
          
          if (!esEquipoReal(partido.equipo_local) || !esEquipoReal(partido.equipo_visita)) {
            continue;
          }
          
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
            clasificados.push(campeon);   // Primer lugar
            clasificados.push(subcampeon); // Segundo lugar
          } else {
          }
          
          break; // Solo procesar un partido de final
        }
        
      } else {
        // === PROCESAMIENTO NORMAL PARA OTRAS RONDAS (IDA Y VUELTA) ===
        for (const partido of partidosRonda) {
          // Solo procesar partidos con equipos reales
          const esEquipoReal = (equipo) => equipo && !equipo.match(/^(WP|WO|WC|WS)\d*\.?[A-Z]*$/);
          
          if (!esEquipoReal(partido.equipo_local) || !esEquipoReal(partido.equipo_visita)) {
            continue;
          }
          
          // Crear identificador único del cruce
          const equipos = [partido.equipo_local, partido.equipo_visita].sort();
          const cruceId = `${equipos[0]}-vs-${equipos[1]}`;
          
          if (crucesUnicos.has(cruceId)) {
            continue;
          }
          crucesUnicos.add(cruceId);
          
          // Buscar partido de vuelta
          const partidoVuelta = partidosRonda.find(p => 
            p.fixture_id !== partido.fixture_id &&
            ((p.equipo_local === partido.equipo_visita && p.equipo_visita === partido.equipo_local))
          );
          
          if (!partidoVuelta) {
            continue;
          }
          
          // Calcular resultado global
          let golesEquipo1 = partido.goles_local + partidoVuelta.goles_visita;
          let golesEquipo2 = partido.goles_visita + partidoVuelta.goles_local;
          let penalesEquipo1 = (partido.penales_local || 0) + (partidoVuelta.penales_visita || 0);
          let penalesEquipo2 = (partido.penales_visita || 0) + (partidoVuelta.penales_local || 0);
          
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
            clasificados.push(ganador);
          } else {
          }
        }
      }
      
      
      // Guardar en clasif_sud
      if (clasificados.length > 0) {
        await pool.query('DELETE FROM clasif_sud WHERE ronda = $1', [ronda]);
        
        // Mapeo de siglas por ronda
        const mapeoSiglasPorRonda = {
          'Knockout Round Play-offs': ['WP01', 'WP02', 'WP03', 'WP04', 'WP05', 'WP06', 'WP07', 'WP08'],
          'Octavos de Final': ['WO.A', 'WO.B', 'WO.C', 'WO.D', 'WO.E', 'WO.F', 'WO.G', 'WO.H'],
          'Cuartos de Final': ['WC1', 'WC2', 'WC3', 'WC4'],
          'Semifinales': ['WS1', 'WS2'],
          'Final': ['Campeón', 'Subcampeón']
        };
        
        // ALGORITMO SIMPLE: Tomar la sigla del fixture donde participó cada ganador
        for (let i = 0; i < clasificados.length; i++) {
          const equipo = clasificados[i];
          
          // Caso especial para la Final
          if (ronda === 'Final') {
            // El primer equipo en clasificados[] es el campeón, el segundo el subcampeón
            const siglas = mapeoSiglasPorRonda[ronda] || [];
            let siglaCorrecta = siglas[i] || null;  // "Campeón" o "Subcampeón" según el índice
            
            console.log(`🏆 [FINAL] ${equipo} → ${siglaCorrecta} (posición ${i+1})`);
            
            await pool.query(
              'INSERT INTO clasif_sud (ronda, clasificados, sigla) VALUES ($1, $2, $3)',
              [ronda, equipo, siglaCorrecta]
            );
            
            console.log(`✅ [SUDAMERICANA] Guardado: ${equipo} → ${siglaCorrecta} en ${ronda}`);
            continue;  // Salta al siguiente equipo
          }
          
          // Para el resto de las rondas, usar el algoritmo normal
          const { rows: fixtureEquipo } = await pool.query(
            'SELECT DISTINCT clasificado FROM sudamericana_fixtures WHERE ronda = $1 AND (equipo_local = $2 OR equipo_visita = $2) LIMIT 1',
            [ronda, equipo]
          );
          
          // Solo para rondas distintas a Final (ya que la Final se maneja en el bloque anterior)
          if (ronda !== 'Final') {
            let siglaCorrecta = null;
            if (fixtureEquipo.length > 0) {
              siglaCorrecta = fixtureEquipo[0].clasificado;
              console.log(`✅ [SIMPLE] ${equipo} participó en fixture con sigla → ${siglaCorrecta}`);
            } else {
              // Fallback secuencial solo si no se encuentra
              const siglas = mapeoSiglasPorRonda[ronda] || [];
              const index = clasificados.indexOf(equipo);
              siglaCorrecta = siglas[index] || null;
              console.log(`⚠️ [FALLBACK] ${equipo} → ${siglaCorrecta} (posición ${index})`);
            }
            
            await pool.query(
              'INSERT INTO clasif_sud (ronda, clasificados, sigla) VALUES ($1, $2, $3)',
              [ronda, equipo, siglaCorrecta]
            );
            
            console.log(`✅ [SUDAMERICANA] Guardado: ${equipo} → ${siglaCorrecta} en ${ronda}`);
          }
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
    // 4. Filtrar partidos (por ronda si corresponde) y enviarlos TAL CUAL están en la base de datos
    let partidos = fixture;
    if (ronda) partidos = partidos.filter(f => f.ronda === ronda);
    // No usar reemplazarSiglasPorNombres - enviar los datos originales sin modificar
    res.json(Array.isArray(partidos) ? partidos : []);
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
