// Recalcula, para la Jornada 10 de Copa Sudamericana, el "final virtual" de
// cada usuario: contra qué dos equipos (según SUS PROPIOS pronósticos de
// semifinal) cree que se juega la final, y el marcador que pronosticó para
// ese partido.
//
// BUG que esto corrige: el partido FINAL se guarda con nombres placeholder
// fijos ("Ganador SF1" vs "Ganador SF2") y el usuario, en la pantalla de
// pronóstico, ve ese marcador etiquetado con SUS PROPIOS finalistas
// pronosticados (JornadaSudamericana.jsx arma esa etiqueta ordenando los 4
// partidos de semifinal por fecha y luego por id). Si el cálculo que arma
// `equipo_local`/`equipo_visita` para guardar usa un orden distinto (antes:
// solo por id, sin fecha), el marcador que el usuario tipeó para "local"
// puede terminar guardado contra el equipo que en realidad vio como
// "visita" en pantalla — lo que hace que el campeón/subcampeón pronosticado
// salga invertido. Por eso acá se usa exactamente el mismo orden
// (fecha, id) que ve el usuario al pronosticar.
export async function recalcularFinalVirtualUsuario(queryable, usuarioId, jornadaNumero) {
  // No confiar solo en la columna p.tipo_partido (puede no haber quedado
  // seteada al cargar los partidos): si falta, se deduce por
  // complementariedad de nombres -- el FINAL es el único partido de la
  // jornada sin un "espejo" (local/visita invertidos); de los que sí tienen
  // espejo, IDA es el de id más chico. Es el mismo criterio que ya usa
  // clasificacionSudamericana.js para mostrar el partido en pantalla, así
  // que acá siempre coincide con lo que el usuario vio.
  const partidosRes = await queryable.query(`
    SELECT sp.partido_id, sp.goles_local, sp.goles_visita, sp.penales_local, sp.penales_visita,
           p.nombre_local, p.nombre_visita, p.jornada_id,
           COALESCE(
             p.tipo_partido,
             CASE
               WHEN NOT EXISTS (
                 SELECT 1 FROM sudamericana_partidos p2
                 WHERE p2.jornada_id = p.jornada_id
                 AND p2.nombre_local = p.nombre_visita
                 AND p2.nombre_visita = p.nombre_local
               ) THEN 'FINAL'
               WHEN EXISTS (
                 SELECT 1 FROM sudamericana_partidos p2
                 WHERE p2.jornada_id = p.jornada_id
                 AND p2.nombre_local = p.nombre_visita
                 AND p2.nombre_visita = p.nombre_local
                 AND p2.id > p.id
               ) THEN 'IDA'
               ELSE 'VUELTA'
             END
           ) as tipo_partido
    FROM sudamericana_pronosticos sp
    JOIN sudamericana_partidos p ON sp.partido_id = p.id
    JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
    WHERE sp.usuario_id = $1 AND sj.numero = $2
    ORDER BY p.fecha, p.id
  `, [usuarioId, jornadaNumero]);

  const partidos = partidosRes.rows;
  const semifinalesIda = partidos.filter(p => p.tipo_partido === 'IDA');
  const semifinalesVuelta = partidos.filter(p => p.tipo_partido === 'VUELTA');
  const partidoFinal = partidos.find(p => p.tipo_partido === 'FINAL');

  if (!partidoFinal || semifinalesIda.length === 0 || semifinalesVuelta.length === 0) {
    return null;
  }

  const finalistas = [];
  semifinalesVuelta.forEach(vuelta => {
    const ida = semifinalesIda.find(i =>
      i.nombre_local === vuelta.nombre_visita && i.nombre_visita === vuelta.nombre_local
    );

    if (ida && ida.goles_local !== null && ida.goles_visita !== null &&
        vuelta.goles_local !== null && vuelta.goles_visita !== null) {

      const golesEquipoLocal = Number(ida.goles_local) + Number(vuelta.goles_visita);
      const golesEquipoVisita = Number(ida.goles_visita) + Number(vuelta.goles_local);

      let ganador = null;
      if (golesEquipoLocal > golesEquipoVisita) {
        ganador = ida.nombre_local;
      } else if (golesEquipoVisita > golesEquipoLocal) {
        ganador = ida.nombre_visita;
      } else {
        const penalesLocal = Number(vuelta.penales_local || 0);
        const penalesVisita = Number(vuelta.penales_visita || 0);
        if (penalesLocal > penalesVisita) {
          ganador = vuelta.nombre_local;
        } else if (penalesVisita > penalesLocal) {
          ganador = vuelta.nombre_visita;
        } else {
          ganador = ida.nombre_local;
        }
      }

      if (ganador) finalistas.push(ganador);
    }
  });

  if (finalistas.length !== 2) return null;

  const [equipo_local, equipo_visita] = finalistas;
  const jornada_id = partidoFinal.jornada_id;

  // Los penales solo tienen sentido si el marcador pronosticado de la final
  // quedó empatado. Si el usuario cambió su pronóstico de un empate a un
  // resultado definido, el formulario puede dejar penales viejos sin
  // limpiar en la tabla de pronósticos -- no los arrastramos al final
  // virtual para que no contaminen la comparación de campeón/subcampeón.
  const empatado = partidoFinal.goles_local === partidoFinal.goles_visita;
  const penalesLocal = empatado ? partidoFinal.penales_local : null;
  const penalesVisita = empatado ? partidoFinal.penales_visita : null;

  await queryable.query(
    'DELETE FROM sudamericana_pronosticos_final_virtual WHERE usuario_id = $1 AND jornada_id = $2',
    [usuarioId, jornada_id]
  );
  await queryable.query(`
    INSERT INTO sudamericana_pronosticos_final_virtual
      (usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    usuarioId, jornada_id, equipo_local, equipo_visita,
    partidoFinal.goles_local, partidoFinal.goles_visita,
    penalesLocal, penalesVisita
  ]);

  return { equipo_local, equipo_visita };
}

// Recalcula el final virtual de TODOS los usuarios que pronosticaron algo en
// esa jornada. Se usa antes de calcular campeón/subcampeón, para no depender
// de filas ya guardadas con el orden incorrecto (ver comentario arriba).
export async function recalcularFinalVirtualTodos(pool, jornadaNumero) {
  const usuariosRes = await pool.query(`
    SELECT DISTINCT sp.usuario_id
    FROM sudamericana_pronosticos sp
    JOIN sudamericana_partidos p ON sp.partido_id = p.id
    JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
    WHERE sj.numero = $1
  `, [jornadaNumero]);

  let actualizados = 0;
  for (const row of usuariosRes.rows) {
    const resultado = await recalcularFinalVirtualUsuario(pool, row.usuario_id, jornadaNumero);
    if (resultado) actualizados++;
  }
  return actualizados;
}
