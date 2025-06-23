import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

const equivalencias = {
  "Audax Italiano": "A. Italiano",
  "Colo-Colo": "Colo Colo",
  "Deportes La Serena": "D. La Serena",
  "Everton": "Everton de Vina",
  "\u00d1ublense": "Nublense",
  "U. Cat\u00f3lica": "U. Catolica",
  "U. De Chile": "Universidad de Chile",
  "U. de Chile": "Universidad de Chile",
  "Uni\u00f3n La Calera": "Union La Calera",
  "Uni\u00f3n Espa\u00f1ola": "Union Espanola"
};

function normalizar(nombre) {
  return equivalencias[nombre] || nombre;
}

const fixturePorJornada = [
    // Jornada 1
  [
    [
      "D. La Serena",
      "Colo Colo"
    ],
    [
      "Palestino",
      "Cobresal"
    ],
    [
      "Deportes Iquique",
      "Coquimbo Unido"
    ],
    [
      "Deportes Limache",
      "Everton de Vina"
    ],
    [
      "U. Catolica",
      "A. Italiano"
    ],
    [
      "Union La Calera",
      "Union Espanola"
    ],
    [
      "Universidad de Chile",
      "Nublense"
    ],
    [
      "O'Higgins",
      "Huachipato"
    ]
  ],
    // Jornada 2
  [
    [
      "Coquimbo Unido",
      "U. Catolica"
    ],
    [
      "A. Italiano",
      "Deportes Iquique"
    ],
    [
      "Cobresal",
      "D. La Serena"
    ],
    [
      "Universidad de Chile",
      "Union La Calera"
    ],
    [
      "Huachipato",
      "Everton de Vina"
    ],
    [
      "Nublense",
      "Deportes Limache"
    ],
    [
      "Union Espanola",
      "Palestino"
    ],
    [
      "Colo Colo",
      "O'Higgins"
    ]
  ],
    // Jornada 3
  [
    [
      "Cobresal",
      "Universidad de Chile"
    ],
    [
      "Huachipato",
      "Colo Colo"
    ],
    [
      "U. Catolica",
      "Deportes Iquique"
    ],
    [
      "Deportes Limache",
      "Coquimbo Unido"
    ],
    [
      "Palestino",
      "A. Italiano"
    ],
    [
      "D. La Serena",
      "Union Espanola"
    ],
    [
      "Union La Calera",
      "O'Higgins"
    ],
    [
      "Everton de Vina",
      "Nublense"
    ]
  ],

    // Jornada 4
  [
    [
      "Unión Española",
      "U. De Chile"
    ],
    [
      "Ñublense",
      "U. Católica"
    ],
    [
      "Coquimbo Unido",	
      "Cobresal"
    ],
    [
      "O'Higgins",
      "Deportes La Serena"
    ],
    [
      "Colo Colo",
      "Everton"
    ],
    [
      "Audax Italiano",
      "Deportes Limache"
    ],
    [
      "Deportes Iquique",
      "Palestino"
    ],
    [
      "Unión La Calera",
      "Huachipato"
    ]
  ],

  // Jornada 5
  [
    [
    "U. Católica",
    "Colo-Colo"
    ],
    [
    "Everton",
    "Coquimbo Unido"
    ],
    [
      "Deportes La Serena",
      "Unión La Calera"
    ],
    [
      "U. De Chile",
      "Audax Italiano"
    ],
    [
      "Deportes Iquique",
      "Unión Española"
    ],
    [
      "Cobresal",
      "O'Higgins"
    ],
    [
      "Palestino",
      "Ñublense"
    ],
    [
      "Deportes Limache",
      "Huachipato"
    ]
  ],
    
  // Jornada 6
  [
    [
    "Everton",
    "U. De Chile"
    ],
    [
    "Unión Española",
    "U. Catolica"
    ],
    [
      "Ñublense",
      "Deportes Iquique"
    ],
    [
      "Unión La Calera",
      "Cobresal"
    ],
    [
      "Huachipato",
      "Deportes La Serena"
    ],
    [
      "O'Higgins",
      "Deportes Limache"
    ],
    [
      "Coquimbo Unido",
      "Audax Italiano"
    ],
    [
      "Colo Colo",
      "Palestino"
    ]
  ],

  // Jornada 7
  [
    [
      "U. De Chile",
      "Colo Colo"
    ],
    [
      "Cobresal",
      "U. Catolica"
    ],
    [
      "Deportes Limache",
      "Deportes Iquique"
    ],
    [
      "Palestino",
      "Union La Calera"
    ],
    [
      "Deportes La Serena",
      "Everton"
    ],
    [
      "Audax Italiano",
      "O'Higgins"
    ],
    [
      "Unión Española",
      "Ñublense"
    ],
    [
      "Coquimbo Unido",
      "Huachipato"
    ]
  ],

  // Jornada 8
  [["Deportes Iquique", "Colo-Colo"],["Huachipato", "Cobresal"],["U. de Chile", "Deportes La Serena"],["Ñublense", "Coquimbo Unido"],["Everton", "Union La Calera"],["U. Catolica", "Deportes Limache"],["Audax Italiano", "Union Espanola"],["O'Higgins", "Palestino"]],
  // Jornada 9
  [["Palestino", "U. de Chile"],["O'Higgins", "Deportes Iquique"],["Colo-Colo", "Coquimbo Unido"],["U. Catolica", "Everton"],["Cobresal", "Deportes Limache"],["Union La Calera", "Audax Italiano"],["Huachipato", "Union Espanola"],["Deportes La Serena", "Ñublense"]],
  // Jornada 10
  [["Deportes Limache", "Colo-Colo"],["Union Espanola", "Cobresal"],["Everton", "Palestino"],["U. de Chile", "U. Catolica"],["Coquimbo Unido", "O'Higgins"],["Deportes Iquique", "Huachipato"],["Audax Italiano", "Deportes La Serena"],["Ñublense", "Union La Calera"]],
  // Jornada 11
  [["Union La Calera", "Coquimbo Unido"],["Cobresal", "Audax Italiano"],["O'Higgins", "U. Catolica"],["Palestino", "Deportes Limache"],["U. de Chile", "Huachipato"],["Deportes La Serena", "Deportes Iquique"],["Union Espanola", "Everton"],["Colo-Colo", "Ñublense"]],
  // Jornada 12
  [["Deportes Limache", "U. de Chile"],["Everton", "Cobresal"],["Coquimbo Unido", "Palestino"],["Colo-Colo", "Union Espanola"],["Ñublense", "O'Higgins"],["U. Catolica", "Deportes La Serena"],["Deportes Iquique", "Union La Calera"],["Audax Italiano", "Huachipato"]],
  // Jornada 13
  [["Deportes La Serena", "Coquimbo Unido"],["Huachipato", "Ñublense"],["U. de Chile", "O'Higgins"],["Everton", "Audax Italiano"],["Palestino", "U. Catolica"],["Union La Calera", "Colo-Colo"],["Cobresal", "Deportes Iquique"],["Union Espanola", "Deportes Limache"]],
  // Jornada 14
  [["Coquimbo Unido", "U. de Chile"],["Colo-Colo", "Cobresal"],["Palestino", "Deportes La Serena"],["Deportes Limache", "Union La Calera"],["Deportes Iquique", "Everton"],["Ñublense", "Audax Italiano"],["O'Higgins", "Union Espanola"],["U. Catolica", "Huachipato"]],
  // Jornada 15
  [["Audax Italiano", "Colo-Colo"],["Union La Calera", "U. Catolica"],["U. de Chile", "Deportes Iquique"],["Union Espanola", "Coquimbo Unido"],["Deportes La Serena", "Deportes Limache"],["Huachipato", "Palestino"],["Everton", "O'Higgins"],["Cobresal", "Ñublense"]],
  // Jornada 16
  [["Colo-Colo", "Deportes La Serena"],["Cobresal", "Palestino"],["Coquimbo Unido", "Deportes Iquique"],["Everton", "Deportes Limache"],["Audax Italiano", "U. Catolica"],["Union Espanola", "Union La Calera"],["Ñublense", "U. de Chile"],["Huachipato", "O'Higgins"]],
  // Jornada 17
  [["U. Catolica", "Coquimbo Unido"],["Deportes Iquique", "Audax Italiano"],["Deportes La Serena", "Cobresal"],["Union La Calera", "U. de Chile"],["Everton", "Huachipato"],["Deportes Limache", "Ñublense"],["Palestino", "Union Espanola"],["O'Higgins", "Colo-Colo"]],
  // Jornada 18
  [["U. de Chile", "Cobresal"],["Colo-Colo", "Huachipato"],["Deportes Iquique", "U. Catolica"],["Coquimbo Unido", "Deportes Limache"],["Audax Italiano", "Palestino"],["Union Espanola", "Deportes La Serena"],["O'Higgins", "Union La Calera"],["Ñublense", "Everton"]],
  // Jornada 19
  [["U. de Chile", "Union Espanola"],["U. Catolica", "Ñublense"],["Cobresal", "Coquimbo Unido"],["Deportes La Serena", "O'Higgins"],["Everton", "Colo-Colo"],["Deportes Limache", "Audax Italiano"],["Palestino", "Deportes Iquique"],["Huachipato", "Union La Calera"]],
  // Jornada 20
  [["Colo-Colo", "U. Catolica"],["Coquimbo Unido", "Everton"],["Union La Calera", "Deportes La Serena"],["Audax Italiano", "U. de Chile"],["Union Espanola", "Deportes Iquique"],["O'Higgins", "Cobresal"],["Ñublense", "Palestino"],["Huachipato", "Deportes Limache"]],
  // Jornada 21
  [["U. de Chile", "Everton"],["U. Catolica", "Union Espanola"],["Deportes Iquique", "Ñublense"],["Cobresal", "Union La Calera"],["Deportes La Serena", "Huachipato"],["Deportes Limache", "O'Higgins"],["Audax Italiano", "Coquimbo Unido"],["Palestino", "Colo-Colo"]],
  // Jornada 22
  [["Colo-Colo", "U. de Chile"],["U. Catolica", "Cobresal"],["Deportes Iquique", "Deportes Limache"],["Union La Calera", "Palestino"],["Everton", "Deportes La Serena"],["O'Higgins", "Audax Italiano"],["Ñublense", "Union Espanola"],["Huachipato", "Coquimbo Unido"]],
  // Jornada 23
  [["Colo-Colo", "Deportes Iquique"],["Cobresal", "Huachipato"],["Deportes La Serena", "U. de Chile"],["Coquimbo Unido", "Ñublense"],["Union La Calera", "Everton"],["Deportes Limache", "U. Catolica"],["Union Espanola", "Audax Italiano"],["Palestino", "O'Higgins"]],
  // Jornada 24
  [["U. de Chile", "Palestino"],["Deportes Iquique", "O'Higgins"],["Coquimbo Unido", "Colo-Colo"],["Everton", "U. Catolica"],["Deportes Limache", "Cobresal"],["Audax Italiano", "Union La Calera"],["Union Espanola", "Huachipato"],["Ñublense", "Deportes La Serena"]],
  // Jornada 25
  [["Colo-Colo", "Deportes Limache"],["U. Catolica", "U. de Chile"],["Cobresal", "Union Espanola"],["Deportes La Serena", "Audax Italiano"],["Union La Calera", "Ñublense"],["Palestino", "Everton"],["O'Higgins", "Coquimbo Unido"],["Huachipato", "Deportes Iquique"]],
  // Jornada 26
  [["U. de Chile", "Huachipato"],["U. Catolica", "O'Higgins"],["Deportes Iquique", "Deportes La Serena"],["Coquimbo Unido", "Union La Calera"],["Everton", "Union Espanola"],["Deportes Limache", "Palestino"],["Audax Italiano", "Cobresal"],["Ñublense", "Colo-Colo"]],
  // Jornada 27
  [["U. de Chile", "Deportes Limache"],["Cobresal", "Everton"],["Deportes La Serena", "U. Catolica"],["Union La Calera", "Deportes Iquique"],["Union Espanola", "Colo-Colo"],["Palestino", "Coquimbo Unido"],["O'Higgins", "Ñublense"],["Huachipato", "Audax Italiano"]],
  // Jornada 28
  [["Colo-Colo", "Union La Calera"],["U. Catolica", "Palestino"],["Deportes Iquique", "Cobresal"],["Coquimbo Unido", "Deportes La Serena"],["Deportes Limache", "Union Espanola"],["Audax Italiano", "Everton"],["O'Higgins", "U. de Chile"],["Ñublense", "Huachipato"]],
  // Jornada 29
  [["U. de Chile", "Coquimbo Unido"],["Cobresal", "Colo-Colo"],["Deportes La Serena", "Palestino"],["Union La Calera", "Deportes Limache"],["Everton", "Deportes Iquique"],["Audax Italiano", "Ñublense"],["Union Espanola", "O'Higgins"],["Huachipato", "U. Catolica"]],
  // Jornada 30
  [["Colo-Colo", "Audax Italiano"],["U. Catolica", "Union La Calera"],["Deportes Iquique", "U. de Chile"],["Coquimbo Unido", "Union Espanola"],["Deportes Limache", "Deportes La Serena"],["Palestino", "Huachipato"],["O'Higgins", "Everton"],["Ñublense", "Cobresal"]]
];

router.post("/asignar-jornadas-240", async (req, res) => {
  try {
    const jornadaIds = [];
    for (let i = 1; i <= fixturePorJornada.length; i++) {
      const result = await pool.query(
        "INSERT INTO jornadas (numero) VALUES ($1) RETURNING id",
        [i]
      );
      jornadaIds.push(result.rows[0].id);
    }

    let errores = [];

    for (let i = 0; i < fixturePorJornada.length; i++) {
      const jornada = fixturePorJornada[i];
      const jornada_id = jornadaIds[i];

      for (const [local, visita] of jornada) {
        const normal_local = normalizar(local);
        const normal_visita = normalizar(visita);

        const partido = await pool.query(
          `SELECT id FROM partidos
           WHERE nombre_local = $1 AND nombre_visita = $2
           LIMIT 1`,
          [normal_local, normal_visita]
        );

        if (partido.rows.length === 0) {
          errores.push("No encontrado: " + local + " vs " + visita);
          continue;
        }

        await pool.query(
          `UPDATE partidos SET jornada_id = $1 WHERE id = $2`,
          [jornada_id, partido.rows[0].id]
        );
      }
    }

    if (errores.length > 0) {
      return res.status(207).json({ mensaje: "Algunos partidos no se asignaron", errores });
    }

    res.json({ mensaje: "Jornadas y partidos asignados correctamente ✅" });
  } catch (error) {
    console.error("Error al asignar jornadas:", error);
    res.status(500).json({ error: "No se pudo asignar jornadas" });
  }
});

export default router;
