// routes/tesoreria.js
import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();

// Middleware combinado: solo admin o tesorero
const soloAdminOTesorero = [verifyToken, authorizeRoles("admin", "tesorero")];

// ─────────────────────────────────────────────
// CONFIGURACIÓN (cuotas y premios por torneo)
// ─────────────────────────────────────────────

// GET /api/tesoreria/configuracion
router.get("/configuracion", ...soloAdminOTesorero, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tesoreria_configuracion ORDER BY torneo`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener configuración tesorería:", err);
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

// PUT /api/tesoreria/configuracion/:torneo
router.put("/configuracion/:torneo", ...soloAdminOTesorero, async (req, res) => {
  const { torneo } = req.params;
  const {
    cuota,
    premio_jornada,
    premio_acumulado_1,
    premio_acumulado_2,
    premio_acumulado_3,
    premio_fase_grupos,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO tesoreria_configuracion
         (torneo, cuota, premio_jornada, premio_acumulado_1, premio_acumulado_2, premio_acumulado_3, premio_fase_grupos, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (torneo) DO UPDATE
         SET cuota              = EXCLUDED.cuota,
             premio_jornada     = EXCLUDED.premio_jornada,
             premio_acumulado_1 = EXCLUDED.premio_acumulado_1,
             premio_acumulado_2 = EXCLUDED.premio_acumulado_2,
             premio_acumulado_3 = EXCLUDED.premio_acumulado_3,
             premio_fase_grupos = EXCLUDED.premio_fase_grupos,
             actualizado_en     = NOW()
       RETURNING *`,
      [torneo, cuota ?? 0, premio_jornada ?? 0, premio_acumulado_1 ?? 0, premio_acumulado_2 ?? 0, premio_acumulado_3 ?? 0, premio_fase_grupos ?? 0]
    );
    res.json({ mensaje: "✅ Configuración guardada", configuracion: result.rows[0] });
  } catch (err) {
    console.error("Error al guardar configuración:", err);
    res.status(500).json({ error: "Error al guardar configuración" });
  }
});

// ─────────────────────────────────────────────
// USUARIOS con participación y estado de pago
// ─────────────────────────────────────────────

// GET /api/tesoreria/usuarios
router.get("/usuarios", ...soloAdminOTesorero, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.nombre,
         u.email,
         u.rol,
         u.activo,
         u.activo_torneo_nacional,
         u.activo_libertadores,
         u.activo_sudamericana,
         u.activo_mundial,
         -- Pagos por torneo (uno por columna)
         MAX(CASE WHEN p.torneo = 'torneo_nacional'  THEN p.cuota_pagada::int END)::boolean AS pago_torneo_nacional,
         MAX(CASE WHEN p.torneo = 'libertadores'     THEN p.cuota_pagada::int END)::boolean AS pago_libertadores,
         MAX(CASE WHEN p.torneo = 'sudamericana'     THEN p.cuota_pagada::int END)::boolean AS pago_sudamericana,
         MAX(CASE WHEN p.torneo = 'mundial'          THEN p.cuota_pagada::int END)::boolean AS pago_mundial
       FROM usuarios u
       LEFT JOIN tesoreria_pagos p ON p.usuario_id = u.id
       WHERE u.rol != 'admin'
       GROUP BY u.id
       ORDER BY u.nombre`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener usuarios tesorería:", err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ─────────────────────────────────────────────
// PAGOS de cuotas
// ─────────────────────────────────────────────

// POST /api/tesoreria/pagos/bulk — marcar múltiples como pagado=true
router.post("/pagos/bulk", ...soloAdminOTesorero, async (req, res) => {
  const { pares } = req.body; // [{ usuario_id, torneo }, ...]
  if (!Array.isArray(pares) || pares.length === 0) {
    return res.status(400).json({ error: "Se requiere un array 'pares' con al menos un elemento" });
  }

  try {
    for (const { usuario_id, torneo } of pares) {
      await pool.query(
        `INSERT INTO tesoreria_pagos (usuario_id, torneo, cuota_pagada, fecha_pago, confirmado_por)
         VALUES ($1, $2, true, NOW(), $3)
         ON CONFLICT (usuario_id, torneo) DO UPDATE
           SET cuota_pagada = true,
               fecha_pago = NOW(),
               confirmado_por = $3`,
        [usuario_id, torneo, req.usuario.id]
      );
    }
    res.json({ mensaje: `✅ ${pares.length} pagos marcados como pagados` });
  } catch (err) {
    console.error("Error en pago bulk:", err);
    res.status(500).json({ error: "Error al procesar pagos en lote" });
  }
});

// PATCH /api/tesoreria/pagos  — toggle pago
router.patch("/pagos", ...soloAdminOTesorero, async (req, res) => {
  const { usuario_id, torneo } = req.body;
  if (!usuario_id || !torneo) {
    return res.status(400).json({ error: "usuario_id y torneo son requeridos" });
  }

  try {
    // Obtener estado actual
    const existing = await pool.query(
      `SELECT id, cuota_pagada FROM tesoreria_pagos WHERE usuario_id = $1 AND torneo = $2`,
      [usuario_id, torneo]
    );

    let result;
    if (existing.rowCount === 0) {
      // Insertar como pagado
      result = await pool.query(
        `INSERT INTO tesoreria_pagos (usuario_id, torneo, cuota_pagada, fecha_pago, confirmado_por)
         VALUES ($1, $2, true, NOW(), $3)
         RETURNING *`,
        [usuario_id, torneo, req.usuario.id]
      );
    } else {
      const nuevoEstado = !existing.rows[0].cuota_pagada;
      result = await pool.query(
        `UPDATE tesoreria_pagos
         SET cuota_pagada = $1,
             fecha_pago = CASE WHEN $1 THEN NOW() ELSE NULL END,
             confirmado_por = $2
         WHERE usuario_id = $3 AND torneo = $4
         RETURNING *`,
        [nuevoEstado, req.usuario.id, usuario_id, torneo]
      );
    }

    res.json({ pago: result.rows[0] });
  } catch (err) {
    console.error("Error al actualizar pago:", err);
    res.status(500).json({ error: "Error al actualizar pago" });
  }
});

// ─────────────────────────────────────────────
// PREMIOS ENTREGADOS
// ─────────────────────────────────────────────

// GET /api/tesoreria/premios
// Une ganadores de los 8 orígenes con el estado de entrega en tesoreria_premios_entregados.
// Si la tabla de un torneo no existe aún, se ignora gracefully.
router.get("/premios", ...soloAdminOTesorero, async (req, res) => {
  try {
    // Verificar qué tablas existen para no romper si alguna falta
    const tablas = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'ganadores_jornada','ganadores_acumulado',
          'libertadores_ganadores_jornada','libertadores_ganadores_acumulado',
          'sudamericana_ganadores_jornada','sudamericana_ganadores_acumulado',
          'mundial_ganadores_jornada','mundial_ganadores_acumulado',
          'mundial_ganadores_fase_grupos'
        )
    `);
    const existentes = new Set(tablas.rows.map(r => r.table_name));

    const partes = [];

    // ── TORNEO NACIONAL ──────────────────────────────────
    if (existentes.has('ganadores_jornada')) {
      partes.push(`
        SELECT
          'torneo_nacional'          AS torneo,
          'jornada'                  AS tipo,
          'Jornada ' || j.numero     AS referencia,
          gj.jugador_id              AS usuario_id,
          gj.puntaje                 AS puntos,
          gj.puntaje                 AS posicion_raw,
          NULL::int                  AS posicion
        FROM ganadores_jornada gj
        JOIN jornadas j ON j.id = gj.jornada_id
      `);
    }
    if (existentes.has('ganadores_acumulado')) {
      partes.push(`
        SELECT * FROM (
          SELECT
            'torneo_nacional'  AS torneo,
            'acumulado_1'      AS tipo,
            'Acumulado Final'  AS referencia,
            ga.usuario_id      AS usuario_id,
            ga.puntaje         AS puntos,
            ga.puntaje         AS posicion_raw,
            NULL::int          AS posicion
          FROM ganadores_acumulado ga
          ORDER BY ga.puntaje DESC
          LIMIT 1
        ) _tn1
      `);
      partes.push(`
        SELECT * FROM (
          SELECT
            'torneo_nacional'  AS torneo,
            'acumulado_2'      AS tipo,
            'Acumulado Final'  AS referencia,
            ga.usuario_id      AS usuario_id,
            ga.puntaje         AS puntos,
            ga.puntaje         AS posicion_raw,
            NULL::int          AS posicion
          FROM ganadores_acumulado ga
          ORDER BY ga.puntaje DESC
          LIMIT 1 OFFSET 1
        ) _tn2
      `);
      partes.push(`
        SELECT * FROM (
          SELECT
            'torneo_nacional'  AS torneo,
            'acumulado_3'      AS tipo,
            'Acumulado Final'  AS referencia,
            ga.usuario_id      AS usuario_id,
            ga.puntaje         AS puntos,
            ga.puntaje         AS posicion_raw,
            NULL::int          AS posicion
          FROM ganadores_acumulado ga
          ORDER BY ga.puntaje DESC
          LIMIT 1 OFFSET 2
        ) _tn3
      `);
    }

    // ── LIBERTADORES ─────────────────────────────────────
    if (existentes.has('libertadores_ganadores_jornada')) {
      partes.push(`
        SELECT
          'libertadores'                   AS torneo,
          'jornada'                        AS tipo,
          'Jornada ' || lgj.jornada_numero AS referencia,
          lgj.usuario_id                   AS usuario_id,
          lgj.puntaje                      AS puntos,
          lgj.puntaje                      AS posicion_raw,
          NULL::int                        AS posicion
        FROM libertadores_ganadores_jornada lgj
      `);
    }
    if (existentes.has('libertadores_ganadores_acumulado')) {
      partes.push(`
        SELECT * FROM (
          SELECT
            'libertadores'    AS torneo,
            'acumulado_1'     AS tipo,
            'Acumulado Final' AS referencia,
            lga.usuario_id    AS usuario_id,
            lga.puntaje       AS puntos,
            lga.puntaje       AS posicion_raw,
            NULL::int         AS posicion
          FROM libertadores_ganadores_acumulado lga
          ORDER BY lga.puntaje DESC LIMIT 1
        ) _lib1
      `);
      partes.push(`
        SELECT * FROM (
          SELECT 'libertadores' AS torneo, 'acumulado_2' AS tipo, 'Acumulado Final' AS referencia,
            lga.usuario_id, lga.puntaje AS puntos, lga.puntaje AS posicion_raw, NULL::int AS posicion
          FROM libertadores_ganadores_acumulado lga ORDER BY lga.puntaje DESC LIMIT 1 OFFSET 1
        ) _lib2
      `);
      partes.push(`
        SELECT * FROM (
          SELECT 'libertadores' AS torneo, 'acumulado_3' AS tipo, 'Acumulado Final' AS referencia,
            lga.usuario_id, lga.puntaje AS puntos, lga.puntaje AS posicion_raw, NULL::int AS posicion
          FROM libertadores_ganadores_acumulado lga ORDER BY lga.puntaje DESC LIMIT 1 OFFSET 2
        ) _lib3
      `);
    }

    // ── SUDAMERICANA ──────────────────────────────────────
    if (existentes.has('sudamericana_ganadores_jornada')) {
      partes.push(`
        SELECT
          'sudamericana'                   AS torneo,
          'jornada'                        AS tipo,
          'Jornada ' || sgj.jornada_numero AS referencia,
          sgj.usuario_id                   AS usuario_id,
          sgj.puntaje                      AS puntos,
          sgj.puntaje                      AS posicion_raw,
          NULL::int                        AS posicion
        FROM sudamericana_ganadores_jornada sgj
      `);
    }
    if (existentes.has('sudamericana_ganadores_acumulado')) {
      partes.push(`
        SELECT * FROM (
          SELECT 'sudamericana' AS torneo, 'acumulado_1' AS tipo, 'Acumulado Final' AS referencia,
            sga.usuario_id, sga.puntaje AS puntos, sga.puntaje AS posicion_raw, NULL::int AS posicion
          FROM sudamericana_ganadores_acumulado sga ORDER BY sga.puntaje DESC LIMIT 1
        ) _sud1
      `);
      partes.push(`
        SELECT * FROM (
          SELECT 'sudamericana' AS torneo, 'acumulado_2' AS tipo, 'Acumulado Final' AS referencia,
            sga.usuario_id, sga.puntaje AS puntos, sga.puntaje AS posicion_raw, NULL::int AS posicion
          FROM sudamericana_ganadores_acumulado sga ORDER BY sga.puntaje DESC LIMIT 1 OFFSET 1
        ) _sud2
      `);
      partes.push(`
        SELECT * FROM (
          SELECT 'sudamericana' AS torneo, 'acumulado_3' AS tipo, 'Acumulado Final' AS referencia,
            sga.usuario_id, sga.puntaje AS puntos, sga.puntaje AS posicion_raw, NULL::int AS posicion
          FROM sudamericana_ganadores_acumulado sga ORDER BY sga.puntaje DESC LIMIT 1 OFFSET 2
        ) _sud3
      `);
    }

    // ── MUNDIAL ────────────────────────────────────────────
    if (existentes.has('mundial_ganadores_jornada')) {
      partes.push(`
        SELECT
          'mundial'                        AS torneo,
          'jornada'                        AS tipo,
          'Jornada ' || mgj.jornada_numero AS referencia,
          mgj.usuario_id                   AS usuario_id,
          COALESCE(mgj.puntos, 0)          AS puntos,
          COALESCE(mgj.puntos, 0)          AS posicion_raw,
          mgj.posicion                     AS posicion
        FROM mundial_ganadores_jornada mgj
        WHERE mgj.posicion = 1
      `);
    }
    if (existentes.has('mundial_ganadores_acumulado')) {
      partes.push(`
        SELECT
          'mundial'                 AS torneo,
          CASE mga.posicion
            WHEN 1 THEN 'acumulado_1'
            WHEN 2 THEN 'acumulado_2'
            WHEN 3 THEN 'acumulado_3'
            ELSE 'acumulado_1'
          END                       AS tipo,
          'Acumulado Final'         AS referencia,
          mga.usuario_id            AS usuario_id,
          COALESCE(mga.puntos_totales, 0) AS puntos,
          COALESCE(mga.puntos_totales, 0) AS posicion_raw,
          mga.posicion              AS posicion
        FROM mundial_ganadores_acumulado mga
        WHERE mga.posicion IN (1,2,3)
      `);
    }
    if (existentes.has('mundial_ganadores_fase_grupos')) {
      partes.push(`
        SELECT
          'mundial'              AS torneo,
          'fase_grupos'          AS tipo,
          'Fase de Grupos'       AS referencia,
          mfg.usuario_id         AS usuario_id,
          COALESCE(mfg.puntos, 0) AS puntos,
          COALESCE(mfg.puntos, 0) AS posicion_raw,
          1                      AS posicion
        FROM mundial_ganadores_fase_grupos mfg
        WHERE mfg.posicion = 1
      `);
    }

    if (partes.length === 0) {
      return res.json([]);
    }

    // Unir todo y cruzar con estado de entrega
    const unionQuery = partes.join('\nUNION ALL\n');
    const result = await pool.query(`
      WITH ganadores AS (
        ${unionQuery}
      )
      SELECT
        g.torneo,
        g.tipo,
        g.referencia,
        g.usuario_id,
        g.puntos,
        g.posicion,
        u.nombre    AS ganador_nombre,
        pe.id       AS premio_id,
        pe.monto,
        COALESCE(pe.entregado, false) AS entregado,
        pe.fecha_entrega,
        c.nombre    AS confirmado_nombre
      FROM ganadores g
      JOIN usuarios u ON u.id = g.usuario_id
      LEFT JOIN tesoreria_premios_entregados pe
             ON pe.usuario_id = g.usuario_id
            AND pe.torneo     = g.torneo
            AND pe.tipo       = g.tipo
            AND pe.referencia = g.referencia
      LEFT JOIN usuarios c ON c.id = pe.confirmado_por
      ORDER BY g.torneo, g.tipo, g.referencia, u.nombre
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener premios:", err);
    res.status(500).json({ error: "Error al obtener premios" });
  }
});

// PATCH /api/tesoreria/premios/toggle — toggle entregado por clave compuesta (ganador real)
// Body: { usuario_id, torneo, tipo, referencia, monto }
router.patch("/premios/toggle", ...soloAdminOTesorero, async (req, res) => {
  const { usuario_id, torneo, tipo, referencia, monto } = req.body;
  if (!usuario_id || !torneo || !tipo || !referencia) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const existing = await pool.query(
      `SELECT id, entregado FROM tesoreria_premios_entregados
       WHERE usuario_id = $1 AND torneo = $2 AND tipo = $3 AND referencia = $4`,
      [usuario_id, torneo, tipo, referencia]
    );

    let result;
    if (existing.rowCount === 0) {
      // Primera vez: insertar como entregado=true
      result = await pool.query(
        `INSERT INTO tesoreria_premios_entregados
           (usuario_id, torneo, tipo, referencia, monto, entregado, fecha_entrega, confirmado_por)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), $6)
         RETURNING *`,
        [usuario_id, torneo, tipo, referencia, monto ?? 0, req.usuario.id]
      );
    } else {
      const nuevoEstado = !existing.rows[0].entregado;
      result = await pool.query(
        `UPDATE tesoreria_premios_entregados
         SET entregado      = $1,
             fecha_entrega  = CASE WHEN $1 THEN NOW() ELSE NULL END,
             confirmado_por = $2
         WHERE id = $3
         RETURNING *`,
        [nuevoEstado, req.usuario.id, existing.rows[0].id]
      );
    }

    res.json({ premio: result.rows[0] });
  } catch (err) {
    console.error("Error al actualizar entrega de premio:", err);
    res.status(500).json({ error: "Error al actualizar entrega" });
  }
});

// POST /api/tesoreria/premios — agregar registro manual (se mantiene por compatibilidad)
router.post("/premios", ...soloAdminOTesorero, async (req, res) => {
  const { usuario_id, torneo, tipo, referencia, monto } = req.body;
  if (!usuario_id || !torneo || !tipo || !referencia) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tesoreria_premios_entregados
         (usuario_id, torneo, tipo, referencia, monto, entregado, confirmado_por)
       VALUES ($1, $2, $3, $4, $5, false, $6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [usuario_id, torneo, tipo, referencia, monto ?? 0, req.usuario.id]
    );
    res.json({ premio: result.rows[0] ?? null });
  } catch (err) {
    console.error("Error al crear premio:", err);
    res.status(500).json({ error: "Error al crear premio" });
  }
});

// PATCH /api/tesoreria/premios/:id — toggle por id (compatibilidad)
router.patch("/premios/:id", ...soloAdminOTesorero, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query(
      `SELECT entregado FROM tesoreria_premios_entregados WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Premio no encontrado" });
    }

    const nuevoEstado = !existing.rows[0].entregado;
    const result = await pool.query(
      `UPDATE tesoreria_premios_entregados
       SET entregado = $1,
           fecha_entrega = CASE WHEN $1 THEN NOW() ELSE NULL END,
           confirmado_por = $2
       WHERE id = $3
       RETURNING *`,
      [nuevoEstado, req.usuario.id, id]
    );
    res.json({ premio: result.rows[0] });
  } catch (err) {
    console.error("Error al actualizar premio:", err);
    res.status(500).json({ error: "Error al actualizar premio" });
  }
});

// DELETE /api/tesoreria/premios/:id
router.delete("/premios/:id", ...soloAdminOTesorero, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM tesoreria_premios_entregados WHERE id = $1`, [id]);
    res.json({ mensaje: "✅ Premio eliminado" });
  } catch (err) {
    console.error("Error al eliminar premio:", err);
    res.status(500).json({ error: "Error al eliminar premio" });
  }
});

export default router;
