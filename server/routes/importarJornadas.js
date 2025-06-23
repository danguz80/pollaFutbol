import express from "express";
import { pool } from "../db/pool.js";
import fetch from "node-fetch";

const router = express.Router();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = "https://api-football-v1.p.rapidapi.com/v3/fixtures";
const LEAGUE_ID = 265;
const SEASON = 2025;

router.post("/importar-todos-los-partidos", async (req, res) => {
  try {
    const response = await fetch(`${BASE_URL}?league=${LEAGUE_ID}&season=${SEASON}`, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com",
      },
    });

    const data = await response.json();
    const partidos = data.response || [];

    let insertados = 0;

    for (const p of partidos) {
      const local = p.teams.home;
      const visita = p.teams.away;

      await pool.query(
        `INSERT INTO partidos (
          id, nombre_local, nombre_visita, equipo_local_id, equipo_visita_id,
          goles_local, goles_visita, estado, fecha
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING`,
        [
          p.fixture.id,
          local.name,
          visita.name,
          local.id,
          visita.id,
          p.goals.home,
          p.goals.away,
          p.fixture.status.short,
          p.fixture.date
        ]
      );

      insertados++;
    }

    res.json({
      mensaje: `Se importaron ${insertados} partidos correctamente ✅`
    });

  } catch (error) {
    console.error("Error al importar todos los partidos:", error);
    res.status(500).json({ error: "No se pudo importar los partidos" });
  }
});

export default router;
