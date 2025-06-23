import express from "express";
import { fetchFromSportmonks } from "../services/sportmonks.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const leagueId = req.query.league_id || "663"; // ID de la Primera División de Chile
        const seasonId = req.query.season_id || "25095"; // ID de la temporada actual

        // Construir el endpoint sin utilizar el parámetro 'filters'
        const endpoint = `/fixtures?include=participants;scores&league_id=${leagueId}&season_id=${seasonId}`;

        const data = await fetchFromSportmonks(endpoint);
        res.json(data);
    } catch (error) {
        console.error("Error al obtener fixtures:", error);
        res.status(500).json({ error: "Error al conectar con Sportmonks" });
    }
});

router.get("/rango", async (req, res) => {
    try {
        const leagueId = 663;
        const seasonId = 25095;

        // Rango de fechas fijo (puedes hacerlo dinámico después si quieres)
        const date_from = "2025-05-23";
        const date_to = "2025-05-27";

        const endpoint = `/fixtures?league_id=${leagueId}&season_id=${seasonId}&date_from=${date_from}&date_to=${date_to}`;

        const data = await fetchFromSportmonks(endpoint);

        const partidos = data.data?.map(partido => {
            return {
                id: partido.id,
                status: partido.status?.name,
                fecha: partido.starting_at?.date_time,
                local: partido.home_team?.name,
                visita: partido.away_team?.name,
                goles_local: partido.scores?.localteam_score,
                goles_visita: partido.scores?.visitorteam_score
            };
        }) || [];


        res.json(partidos);
    } catch (error) {
        console.error("Error al obtener fixtures por rango:", error);
        res.status(500).json({ error: "No se pudieron obtener los partidos del rango de fechas" });
    }
});

router.get("/debug-fixtures", async (req, res) => {
  try {
    const leagueId = 663;
    const seasonId = 25095;
    const date_from = "2025-05-23";
    const date_to = "2025-05-27";

    const endpoint = `/fixtures?league_id=${leagueId}&season_id=${seasonId}&date_from=${date_from}&date_to=${date_to}`;
    const data = await fetchFromSportmonks(endpoint);

    res.json(data); // Mostrar todo el JSON sin filtrar
  } catch (error) {
    console.error("Error al hacer debug de fixtures:", error);
    res.status(500).json({ error: "Error al obtener el debug de fixtures" });
  }
});


export default router;
