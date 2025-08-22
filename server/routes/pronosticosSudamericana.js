import express from "express";
import { pool } from "../db/pool.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';
import { verifyToken } from "../middleware/verifyToken.js";
import { definirClasificadosPlayoffs } from '../services/clasificacionSudamericana.js';

const router = express.Router();

// Función para obtener la posición de un equipo en pronósticos
async function obtenerPosicionEquipo(nombreEquipo) {
  try {
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

    // Buscar en primeros_sud (posiciones 1-8)
    for (const nombre of nombresAlternativos) {
      const primerosSud = await pool.query('SELECT pos FROM primeros_sud WHERE equipo = $1', [nombre]);
      if (primerosSud.rows.length > 0) {
        return primerosSud.rows[0].pos;
      }
    }

    // Buscar en segundos_sud (posiciones 9-16)
    for (const nombre of nombresAlternativos) {
      const segundosSud = await pool.query('SELECT pos FROM segundos_sud WHERE equipo = $1', [nombre]);
      if (segundosSud.rows.length > 0) {
        return segundosSud.rows[0].pos;
      }
    }

    // Buscar en terceros_lib (posiciones 17-24)
    for (const nombre of nombresAlternativos) {
      const tercerosLib = await pool.query('SELECT pos FROM terceros_lib WHERE equipo = $1', [nombre]);
      if (tercerosLib.rows.length > 0) {
        return tercerosLib.rows[0].pos;
      }
    }

    // POSICIONES PREDETERMINADAS PARA EQUIPOS ESPECÍFICOS
    const POSICIONES_PREDETERMINADAS = {
      'Atletico-MG': 11,  // Posición conocida de Atletico-MG
      'Bolívar': 21,      // Posición conocida de Bolívar
    };

    if (POSICIONES_PREDETERMINADAS[nombreEquipo]) {
      return POSICIONES_PREDETERMINADAS[nombreEquipo];
    }

    // Si no se encuentra, retornar posición muy alta (baja prioridad)
    return 999;
  } catch (error) {
    console.error('❌ [PRONÓSTICO] Error obteniendo posición del equipo:', error);
    return 999;
  }
}

// POST /api/sudamericana/guardar-pronosticos-elim
router.post("/guardar-pronosticos-elim", verifyToken, async (req, res) => {
  const { usuario_id, pronosticos } = req.body;
  
  // Verificar que el usuario_id del body coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuario_id)) {
    return res.status(403).json({ error: "No autorizado: usuario_id no coincide con el usuario autenticado" });
  }

  // BLOQUEAR ADMINS: Los admins no pueden hacer pronósticos
  if (req.usuario.rol === 'admin') {
    return res.status(403).json({ 
      error: "Los administradores no pueden realizar pronósticos. Su función es ingresar resultados reales." 
    });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para realizar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }

  if (!usuario_id || !pronosticos || !Array.isArray(pronosticos)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (pronosticos.length === 0) {
  } else {
    pronosticos.forEach((p, i) => {
    });
  }
  let exitos = 0;
  let errores = [];
  try {
    // 1. Guardar pronósticos individuales
    for (const p of pronosticos) {
      try {
        await pool.query(
          `INSERT INTO pronosticos_sudamericana (usuario_id, fixture_id, ronda, equipo_local, equipo_visita, ganador, goles_local, goles_visita, penales_local, penales_visita)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (usuario_id, fixture_id) DO UPDATE SET
             ronda = EXCLUDED.ronda,
             equipo_local = EXCLUDED.equipo_local,
             equipo_visita = EXCLUDED.equipo_visita,
             ganador = EXCLUDED.ganador,
             goles_local = EXCLUDED.goles_local,
             goles_visita = EXCLUDED.goles_visita,
             penales_local = EXCLUDED.penales_local,
             penales_visita = EXCLUDED.penales_visita
          `,
          [
            usuario_id,
            p.fixture_id,
            p.ronda,
            p.equipo_local,
            p.equipo_visita,
            p.ganador,
            p.goles_local,
            p.goles_visita,
            p.penales_local,
            p.penales_visita
          ]
        );
        exitos++;
      } catch (err) {
        console.error("[ERROR][INSERT/UPDATE]", err, p);
        errores.push({ fixture_id: p.fixture_id, error: err.message });
      }
    }
    
    // 2. Calcular clasificados basado en los pronósticos actualizados
    if (errores.length === 0) {
      try {
        // Obtener fixture completo y ordenarlo por fixture_id
        const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id ASC');
        const fixture = fixtureRes.rows;
        
        // Obtener todos los pronósticos del usuario
        const pronosRes = await pool.query(
          'SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1 ORDER BY fixture_id ASC',
          [usuario_id]
        );
        const pronos = pronosRes.rows;
        
        console.log(`🔍 [DEBUG] Calculando clasificados para usuario ${usuario_id} con ${pronos.length} pronósticos`);
        
        // Aplicar privilegios de local/visita a los fixtures
        const fixtureConPrivilegios = await aplicarPrivilegiosLocalVisita(fixture);
        
        // Calculamos un diccionario global de siglas usando la función existente
        const dicSiglas = calcularAvanceSiglas(fixtureConPrivilegios, pronos);
        console.log(`🔍 [DEBUG] Diccionario de siglas calculado:`, dicSiglas);
        
        // Mapeo de rondas para guardar clasificados
        const RONDAS = [
          "Knockout Round Play-offs",
          "Octavos de Final",
          "Cuartos de Final",
          "Semifinales",
          "Final"
        ];
        
        // Eliminar clasificados anteriores del usuario
        try {
          await pool.query(
            'DELETE FROM clasif_sud_pron WHERE usuario_id = $1',
            [usuario_id]
          );
          console.log(`🗑️ [LIMPIAR] Clasificados anteriores eliminados para usuario ${usuario_id}`);
        } catch (error) {
          console.error(`❌ [ERROR] No se pudieron eliminar clasificados anteriores: ${error.message}`);
          throw error; // Propagar el error para que falle la transacción completa
        }
        
        // Procesamos cada ronda, calculando los ganadores directamente
        for (const ronda of RONDAS) {
          console.log(`🔍 [PRONÓSTICOS] Procesando ronda ${ronda}`);
          
          // Obtener pronósticos para esta ronda
          const pronosticosRonda = pronos.filter(p => p.ronda === ronda);
          
          // Obtener fixtures para esta ronda
          const fixturesRonda = fixtureConPrivilegios.filter(f => f.ronda === ronda);
          
          // Agrupar fixtures por su clasificado
          const fixturesPorClasificado = {};
          fixturesRonda.forEach(f => {
            if (f.clasificado) {
              if (!fixturesPorClasificado[f.clasificado]) {
                fixturesPorClasificado[f.clasificado] = [];
              }
              fixturesPorClasificado[f.clasificado].push(f);
            }
          });
          
          // Calcular ganadores por cada grupo de partidos
          const clasificados = [];
          
          // Para cada clasificado (sigla), buscar los partidos
          for (const [siglaFixture, partidos] of Object.entries(fixturesPorClasificado)) {
            // Buscar pronósticos para estos partidos
            const pronosPartidos = [];
            for (const partido of partidos) {
              const pron = pronos.find(p => p.fixture_id === partido.fixture_id);
              if (pron) pronosPartidos.push({...pron, partido});
            }
            
            // Si hay pronósticos, determinar el ganador
            if (pronosPartidos.length > 0) {
              let ganador = null;
              
              // Para partidos ida y vuelta
              if (partidos.length === 2) {
                const equipos = [partidos[0].equipo_local, partidos[0].equipo_visita];
                const golesPorEquipo = {};
                equipos.forEach(e => golesPorEquipo[e] = 0);
                
                // Sumar goles de ida
                const pronoIda = pronosPartidos.find(p => p.partido.fixture_id === partidos[0].fixture_id);
                if (pronoIda && pronoIda.goles_local !== null && pronoIda.goles_visita !== null) {
                  golesPorEquipo[partidos[0].equipo_local] += pronoIda.goles_local;
                  golesPorEquipo[partidos[0].equipo_visita] += pronoIda.goles_visita;
                }
                
                // Sumar goles de vuelta
                const pronoVuelta = pronosPartidos.find(p => p.partido.fixture_id === partidos[1].fixture_id);
                if (pronoVuelta && pronoVuelta.goles_local !== null && pronoVuelta.goles_visita !== null) {
                  golesPorEquipo[partidos[1].equipo_local] += pronoVuelta.goles_local;
                  golesPorEquipo[partidos[1].equipo_visita] += pronoVuelta.goles_visita;
                }
                
                // Determinar ganador por goles
                if (golesPorEquipo[equipos[0]] > golesPorEquipo[equipos[1]]) {
                  ganador = equipos[0];
                } else if (golesPorEquipo[equipos[1]] > golesPorEquipo[equipos[0]]) {
                  ganador = equipos[1];
                } else if (pronoVuelta && pronoVuelta.penales_local !== null && pronoVuelta.penales_visita !== null) {
                  // Desempate por penales
                  if (pronoVuelta.penales_local > pronoVuelta.penales_visita) {
                    ganador = partidos[1].equipo_local;
                  } else {
                    ganador = partidos[1].equipo_visita;
                  }
                }
              } 
              // Para partido único (como la final)
              else if (partidos.length === 1 && pronosPartidos.length === 1) {
                const prono = pronosPartidos[0];
                const partido = partidos[0];
                
                if (prono.goles_local !== null && prono.goles_visita !== null) {
                  if (prono.goles_local > prono.goles_visita) {
                    ganador = partido.equipo_local;
                  } else if (prono.goles_visita > prono.goles_local) {
                    ganador = partido.equipo_visita;
                  } else if (prono.penales_local !== null && prono.penales_visita !== null) {
                    if (prono.penales_local > prono.penales_visita) {
                      ganador = partido.equipo_local;
                    } else {
                      ganador = partido.equipo_visita;
                    }
                  }
                }
              }
              
              // Si hay un ganador, agregarlo a la lista
              if (ganador) {
                clasificados.push(ganador);
                console.log(`✅ [PRONÓSTICOS] ${ganador} clasifica con sigla ${siglaFixture}`);
              }
            }
          }
          
          // Solo procesar si hay clasificados para esta ronda
          if (clasificados.length > 0) {
            console.log(`✅ [PRONÓSTICOS] Guardando ${clasificados.length} clasificados para ${ronda}`);
            
            // Para la Final, asignar Campeón y Subcampeón
            if (ronda === 'Final') {
              for (let i = 0; i < clasificados.length; i++) {
                const equipo = clasificados[i];
                let sigla = null;
                
                // Asignar directamente Campeón o Subcampeón
                if (i === 0) {
                  sigla = 'Campeón';
                } else if (i === 1) {
                  sigla = 'Subcampeón';
                }
                
                console.log(`✅ [GUARDAR-FINAL] Insertando en clasif_sud_pron: usuario=${usuario_id}, ronda=${ronda}, equipo=${equipo}, sigla=${sigla}`);
                
                try {
                  await pool.query(
                    'INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados, sigla) VALUES ($1, $2, $3, $4)',
                    [usuario_id, ronda, equipo, sigla]
                  );
                } catch (error) {
                  console.error(`❌ [ERROR-FINAL] No se pudo insertar en clasif_sud_pron: ${error.message}`);
                  throw error; // Propagamos el error para que la transacción falle
                }
              }
            } else {
              // Para otras rondas, guardar normalmente
              for (const equipo of clasificados) {
                // Buscar la sigla en el fixture original
                let siglaEquipo = null;
                
                try {
                  // Intentar obtener sigla del fixture para equipos reales
                  // Buscar en clasificado -> equipo_local/equipo_visita
                  for (const fixture of fixtureConPrivilegios) {
                    if (fixture.clasificado && 
                        ((fixture.equipo_local === equipo.trim()) || 
                        (fixture.equipo_visita === equipo.trim()))) {
                      siglaEquipo = fixture.clasificado;
                      console.log(`✅ [GUARDAR] Encontrada sigla ${siglaEquipo} para equipo ${equipo.trim()} en fixture`);
                      break;
                    }
                  }
                } catch (error) {
                  console.error(`❌ [ERROR] Error buscando sigla en fixture: ${error.message}`);
                }
                
                // Para la final, usar Campeón y Subcampeón siempre
                if (ronda === 'Final') {
                  const idx = clasificados.indexOf(equipo);
                  if (idx === 0) {
                    siglaEquipo = 'Campeón';
                    console.log(`✅ [GUARDAR] Asignando sigla Campeón para ${equipo.trim()}`);
                  }
                  else if (idx === 1) {
                    siglaEquipo = 'Subcampeón';
                    console.log(`✅ [GUARDAR] Asignando sigla Subcampeón para ${equipo.trim()}`);
                  }
                } 
                // Si todavía no tiene sigla y no es final, intentar generar una
                else if (!siglaEquipo) {
                  // Asignar siglas basadas en la ronda y posición
                  if (ronda === 'Octavos de Final') {
                    const letras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                    const idx = clasificados.indexOf(equipo);
                    if (idx >= 0 && idx < letras.length) {
                      siglaEquipo = `WO.${letras[idx]}`;
                      console.log(`✅ [GUARDAR] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  } else if (ronda === 'Cuartos de Final') {
                    const idx = clasificados.indexOf(equipo);
                    if (idx >= 0 && idx < 4) {
                      siglaEquipo = `WC${idx+1}`;
                      console.log(`✅ [GUARDAR] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  } else if (ronda === 'Semifinales') {
                    const idx = clasificados.indexOf(equipo);
                    if (idx >= 0 && idx < 2) {
                      siglaEquipo = `WS${idx+1}`;
                      console.log(`✅ [GUARDAR] Generando sigla ${siglaEquipo} para ${equipo.trim()}`);
                    }
                  }
                }
                
                console.log(`✅ [GUARDAR] Insertando en clasif_sud_pron: usuario=${usuario_id}, ronda=${ronda}, equipo=${equipo}, sigla=${siglaEquipo}`);
                
                try {
                  await pool.query(
                    'INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados, sigla) VALUES ($1, $2, $3, $4)',
                    [usuario_id, ronda, equipo, siglaEquipo]
                  );
                } catch (error) {
                  console.error(`❌ [ERROR] No se pudo insertar en clasif_sud_pron: ${error.message}`);
                  throw error; // Propagamos el error para que la transacción falle
                }
              }
            }
          }
        }
        
        res.json({ ok: true, exitos, message: `${exitos} pronósticos guardados y clasificados actualizados correctamente` });
      } catch (updateError) {
        console.error('❌ Error calculando clasificados:', updateError);
        // Los pronósticos se guardaron, pero hubo error al calcular clasificados
        res.json({ ok: true, exitos, warning: 'Pronósticos guardados pero error actualizando clasificados: ' + updateError.message });
      }
    } else {
      res.status(207).json({ ok: false, exitos, errores, message: "Algunos pronósticos no se guardaron. Revisa los logs del backend." });
    }
  } catch (error) {
    console.error("Error guardando pronósticos eliminación directa:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Función para aplicar privilegios de local/visita en cruces
async function aplicarPrivilegiosLocalVisita(cruces) {
  // Agrupar cruces por fixture_id y ronda
  const crucesPorRonda = {};
  for (const cruce of cruces) {
    if (!crucesPorRonda[cruce.ronda]) {
      crucesPorRonda[cruce.ronda] = {};
    }
    
    const key = cruce.clasificado || `${cruce.equipo_local}_${cruce.equipo_visita}`;
    if (!crucesPorRonda[cruce.ronda][key]) {
      crucesPorRonda[cruce.ronda][key] = [];
    }
    crucesPorRonda[cruce.ronda][key].push(cruce);
  }
  
  // Resultado modificado
  const result = [...cruces];
  
    // Procesar cada ronda y cruce
  for (const [ronda, crucesDic] of Object.entries(crucesPorRonda)) {
    // Saltar "Knockout Round Play-offs" y la "Final" (partido único)
    if (ronda === "Knockout Round Play-offs" || ronda === "Final") {
      continue;
    }
    
    for (const [key, partidosCruce] of Object.entries(crucesDic)) {
      // Necesitamos exactamente 2 partidos para ida y vuelta
      if (partidosCruce.length !== 2) {
        continue;
      }
      
      // Ordenar SIEMPRE partidos por fixture_id (no por fecha)
      const partidosOrdenados = [...partidosCruce].sort((a, b) => a.fixture_id - b.fixture_id);
      const partidoIda = partidosOrdenados[0];
      const partidoVuelta = partidosOrdenados[1];
      
      // Obtener equipo local y visitante del partido de ida
      const equipoLocal = partidoIda.equipo_local;
      const equipoVisita = partidoIda.equipo_visita;
      
      // Determinar privilegios basado en posiciones
      const posicionLocal = await obtenerPosicionEquipo(equipoLocal);
      const posicionVisita = await obtenerPosicionEquipo(equipoVisita);      // Índices en el array de resultados para actualizar
      const idxIda = result.findIndex(c => c.fixture_id === partidoIda.fixture_id);
      const idxVuelta = result.findIndex(c => c.fixture_id === partidoVuelta.fixture_id);
      
      // El de mejor posición (menor número) cierra de local
      if (posicionLocal < posicionVisita) {
        // Equipo local tiene mejor posición y debe cerrar de local
        result[idxIda].equipo_local = equipoVisita;
        result[idxIda].equipo_visita = equipoLocal;
        
        result[idxVuelta].equipo_local = equipoLocal;
        result[idxVuelta].equipo_visita = equipoVisita;
        
        console.log(`🏠 [PRONÓSTICOS] Aplicando privilegio en ${ronda}: ${equipoLocal} (${posicionLocal}) cierra de local vs ${equipoVisita} (${posicionVisita})`);
      } else {
        // Equipo visitante tiene mejor posición y debe cerrar de local
        result[idxIda].equipo_local = equipoLocal;
        result[idxIda].equipo_visita = equipoVisita;
        
        result[idxVuelta].equipo_local = equipoVisita;
        result[idxVuelta].equipo_visita = equipoLocal;
        
        console.log(`🏠 [PRONÓSTICOS] Aplicando privilegio en ${ronda}: ${equipoVisita} (${posicionVisita}) cierra de local vs ${equipoLocal} (${posicionLocal})`);
      }
    }
  }
  
  return result;
}

// GET /api/sudamericana/pronosticos-elim/:usuarioId
router.get("/pronosticos-elim/:usuarioId", verifyToken, async (req, res) => {
  const { usuarioId } = req.params;
  
  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios pronósticos" });
  }

  // BLOQUEAR ADMINS: Los admins no tienen pronósticos para consultar
  if (req.usuario.rol === 'admin') {
    return res.status(403).json({ 
      error: "Los administradores no tienen pronósticos para consultar. Su función es ingresar resultados reales." 
    });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // 1. Obtener todos los pronósticos del usuario ordenados por fixture_id (no por fecha)
    const result = await pool.query(
      `SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1 ORDER BY fixture_id ASC`,
      [usuarioId]
    );
    const pronos = result.rows;
    
    // 2. Obtener fixture completo ordenado por fixture_id
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id ASC');
    const fixture = fixtureRes.rows;
    
    // 3. Aplicar privilegios de local/visita en los cruces
    const fixtureConPrivilegios = await aplicarPrivilegiosLocalVisita(fixture);
    
    // 4. Calcular avance de cruces con pronósticos (como en el frontend)
    const dicSiglas = calcularAvanceSiglas(fixtureConPrivilegios, pronos);
    
    // 5. Reemplazar siglas por nombres reales
    const pronosConNombres = reemplazarSiglasPorNombres(pronos, dicSiglas);
        
    res.json(pronosConNombres);
  } catch (error) {
    console.error('❌ [PRONÓSTICO] Error obteniendo pronósticos:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/sudamericana/pronosticos/calcular/:ronda - Calcular puntajes para una ronda específica
router.post("/pronosticos/calcular/:ronda", async (req, res) => {
  const { ronda } = req.params;

  try {

    // Obtener todos los pronósticos de la ronda específica
    const pronosticos = await pool.query(
      `SELECT ps.id, ps.usuario_id, ps.fixture_id, ps.goles_local AS pred_local, ps.goles_visita AS pred_visita, ps.ganador AS pred_ganador,
              ps.penales_local AS pred_penales_local, ps.penales_visita AS pred_penales_visita,
              sf.goles_local AS real_local, sf.goles_visita AS real_visita, sf.ganador AS real_ganador,
              sf.penales_local AS real_penales_local, sf.penales_visita AS real_penales_visita,
              COALESCE(sf.bonus, 1) AS bonus, sf.ronda
       FROM pronosticos_sudamericana ps
       JOIN sudamericana_fixtures sf ON ps.fixture_id = sf.fixture_id
       WHERE sf.ronda = $1`,
      [ronda]
    );

    if (pronosticos.rowCount === 0) {
      return res.status(404).json({ error: "No hay pronósticos para esta ronda" });
    }

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      const realLocal = p.real_local;
      const realVisita = p.real_visita;
      const realGanador = p.real_ganador;
      const bonus = parseInt(p.bonus) || 1;

      // Solo calcular si tenemos resultados reales
      if (realLocal === null || realVisita === null || !realGanador) {
        console.warn(`⚠️ Saltando partido ${p.fixture_id} - faltan resultados reales`);
        continue;
      }

      // Calcular puntaje base según las reglas de Sudamericana
      let puntosBase = 0;

      // Primero verificar si acertó el resultado exacto
      if (p.pred_local === realLocal && p.pred_visita === realVisita) {
        puntosBase = 5; // Resultado exacto
      }
      // Si no, verificar si acertó el ganador
      else if (p.pred_ganador === realGanador) {
        puntosBase = 3; // Ganador correcto
      }
      // Si no acertó nada, verificar la diferencia de goles
      else {
        const predDif = p.pred_local - p.pred_visita;
        const realDif = realLocal - realVisita;
        
        if (predDif === realDif) {
          puntosBase = 2; // Diferencia exacta pero ganador equivocado
        } else {
          const predSigno = Math.sign(predDif);
          const realSigno = Math.sign(realDif);
          
          if (predSigno === realSigno) {
            puntosBase = 1; // Al menos el signo (empate, victoria local/visita)
          }
        }
      }

      // Multiplicar por bonus
      const puntos = puntosBase * bonus;

      // Actualizar los puntos en la base de datos
      await pool.query(
        `UPDATE pronosticos_sudamericana SET puntos = $1 WHERE id = $2`,
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({
      mensaje: `✅ Puntajes recalculados correctamente para la ronda ${ronda}`,
      pronosticos: pronosticos.rowCount,
      actualizados
    });

  } catch (error) {
    console.error("Error al calcular puntajes Sudamericana:", error);
    res.status(500).json({ error: "Error interno al calcular los puntajes" });
  }
});

export default router;
