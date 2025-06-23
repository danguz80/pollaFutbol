import dotenv from "dotenv";
dotenv.config();
import fetch from "node-fetch";
import { getJornadasActivas } from "./utils/getJornadasActivas.js";

console.log("🟢 Script de actualización iniciado...");

const BASE_URL = "http://localhost:3000/api/pronosticos"; // ajusta puerto si es necesario

async function calcularTodas() {
  const jornadas = await getJornadasActivas();

  for (const numero of jornadas) {
    try {
      const res = await fetch(`${BASE_URL}/calcular/${numero}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      const json = await res.json();
      console.log(`Jornada ${numero}:`, json);
    } catch (err) {
      console.error(`Error jornada ${numero}:`, err.message);
    }
  }
}

await calcularTodas();
