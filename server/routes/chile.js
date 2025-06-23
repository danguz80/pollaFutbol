import express from "express";
import fetch from "node-fetch";

const router = express.Router();
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

router.get("/fixtures", async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: "Debes proporcionar 'from' y 'to' como fechas YYYY-MM-DD" });
    }

    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=265&season=2025&from=${from}&to=${to}`;

    const options = {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com"
      }
    };

    const response = await fetch(url, options);
    const data = await response.json();

    const partidos = data.response.map(p => ({
      id: p.fixture.id,
      fecha: p.fixture.date,
      status: p.fixture.status.short,
      estadio: p.fixture.venue.name,
      local: p.teams.home.name,
      visita: p.teams.away.name,
      goles_local: p.goals.home,
      goles_visita: p.goals.away
    }));

    res.json(partidos);
  } catch (error) {
    console.error("Error al obtener fixtures de Chile:", error);
    res.status(500).json({ error: "No se pudieron obtener los partidos del rango solicitado" });
  }
});

export default router;
