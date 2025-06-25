import { useState } from "react";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;


function ChileFixtures() {
    const [modo, setModo] = useState("fecha"); // "fecha" o "jornada"
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [jornada, setJornada] = useState("");
    const [partidos, setPartidos] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchFixtures = async () => {
        setLoading(true);

        let url = "";

        if (modo === "fecha") {
            if (!from || !to) {
                setLoading(false);
                return alert("Debes seleccionar ambas fechas");
            }
            // Usar la variable de entorno para la URL del backend
            url = `${API_BASE_URL}/api/chile/fixtures?from=${from}&to=${to}`;
        } else if (modo === "jornada") {
            if (!jornada) {
                setLoading(false);
                return alert("Debes seleccionar una jornada");
            }
            // Usar la variable de entorno para la URL del backend
            url = `${API_BASE_URL}/api/chile/fixtures?jornada=${jornada}`;
        }

        try {
            const res = await fetch(url);
            const data = await res.json();
            setPartidos(data);
        } catch (err) {
            alert("Error al cargar los partidos");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mt-4">
            <h2>⚽ Partidos Liga Chilena (API-Football)</h2>

            <div className="row g-3 mb-4">
                <div className="col-md-3">
                    <label className="form-label">Filtrar por</label>
                    <select className="form-select" value={modo} onChange={e => setModo(e.target.value)}>
                        <option value="fecha">Rango de fechas</option>
                        <option value="jornada">Número de jornada</option>
                    </select>
                </div>

                {modo === "fecha" && (
                    <>
                        <div className="col-md-3">
                            <label className="form-label">Desde</label>
                            <input
                                type="date"
                                className="form-control"
                                value={from}
                                onChange={e => setFrom(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Hasta</label>
                            <input
                                type="date"
                                className="form-control"
                                value={to}
                                onChange={e => setTo(e.target.value)}
                            />
                        </div>
                    </>
                )}

                {modo === "jornada" && (
                    <div className="col-md-3">
                        <label className="form-label">Jornada</label>
                        <select className="form-select" value={jornada} onChange={e => setJornada(e.target.value)}>
                            <option value="">-- Selecciona --</option>
                            {Array.from({ length: 30 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                    Jornada {i + 1}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="col-md-3 d-flex align-items-end">
                    <button onClick={fetchFixtures} className="btn btn-primary w-100">
                        🔍 Buscar
                    </button>
                </div>
            </div>

            {loading && <p>Cargando partidos...</p>}

            {partidos.length > 0 && (
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Local</th>
                            <th>Marcador</th>
                            <th>Visita</th>
                            <th>Estadio</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {partidos.map(p => (
                            <tr key={p.id}>
                                <td>{new Date(p.fecha).toLocaleString("es-CL")}</td>
                                <td>{p.local}</td>
                                <td>{p.goles_local} - {p.goles_visita}</td>
                                <td>{p.visita}</td>
                                <td>{p.estadio}</td>
                                <td>{p.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {partidos.length === 0 && !loading && <p>No hay partidos en ese filtro.</p>}
        </div>
    );
}

export default ChileFixtures;
