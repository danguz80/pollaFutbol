import fetch from "node-fetch";

const BASE_URL = "https://api.sportmonks.com/v3/football";
const TOKEN = process.env.SPORTMONKS_TOKEN;

export async function fetchFromSportmonks(endpoint) {
  const joiner = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${joiner}api_token=${TOKEN}`;
  const res = await fetch(url);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error de Sportmonks: ${res.status} - ${errorText}`);
  }

  return await res.json();
}
