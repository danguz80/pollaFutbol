import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

const LOGOS_EQUIPOS = {
  "Colo-Colo": "/logos_torneo_nacional/colo-colo.png",
  "U. de Chile": "/logos_torneo_nacional/udechile.png",
  "U. Católica": "/logos_torneo_nacional/uc.png",
  "Unión Española": "/logos_torneo_nacional/union-espanola.png",
  "Palestino": "/logos_torneo_nacional/palestino.png",
  "Huachipato": "/logos_torneo_nacional/huachipato.png",
  "Cobresal": "/logos_torneo_nacional/cobresal.png",
  "Deportes Iquique": "/logos_torneo_nacional/iquique.png",
  "Everton": "/logos_torneo_nacional/everton.png",
  "Audax Italiano": "/logos_torneo_nacional/audax.png",
  "Coquimbo Unido": "/logos_torneo_nacional/coquimbo.png",
  "Unión La Calera": "/logos_torneo_nacional/calera.png",
  "O'Higgins": "/logos_torneo_nacional/ohiggins.webp",
  "Ñublense": "/logos_torneo_nacional/ñublense.png",
  "Deportes La Serena": "/logos_torneo_nacional/laserena.png",
  "Deportes Limache": "/logos_torneo_nacional/limache.webp",
  "Universidad de Concepción": "/logos_torneo_nacional/udeconce.png",
};

const LastMatchsNacional = ({ ordenEquipos = [] }) => {
  const [historiales, setHistoriales] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargarHistoriales = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/estadisticas-nacional/ultimos-partidos`
      );
      console.log('Historiales recibidos:', response.data);
      
      // Ordenar los historiales según el orden de la tabla de posiciones
      let historialesOrdenados = response.data;
      if (ordenEquipos.length > 0) {
        historialesOrdenados = ordenEquipos.map(nombreEquipo => 
          response.data.find(h => h.equipo === nombreEquipo)
        ).filter(Boolean); // Eliminar undefined
      }
      
      setHistoriales(historialesOrdenados);
    } catch (error) {
      console.error("Error cargando historiales:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ordenEquipos.length > 0) {
      cargarHistoriales();
    }
  }, [ordenEquipos]);

  const renderResultado = (resultado) => {
    if (resultado === "V") {
      return (
        <div
          className="d-flex justify-content-center align-items-center rounded"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "#28a745",
            color: "white",
            fontWeight: "bold",
            fontSize: "18px",
          }}
        >
          ✓
        </div>
      );
    } else if (resultado === "E") {
      return (
        <div
          className="d-flex justify-content-center align-items-center rounded"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "#6c757d",
            color: "white",
            fontWeight: "bold",
            fontSize: "18px",
          }}
        >
          =
        </div>
      );
    } else if (resultado === "D") {
      return (
        <div
          className="d-flex justify-content-center align-items-center rounded"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "#dc3545",
            color: "white",
            fontWeight: "bold",
            fontSize: "18px",
          }}
        >
          ✗
        </div>
      );
    }
    return (
      <div
        className="d-flex justify-content-center align-items-center rounded"
        style={{
          width: "32px",
          height: "32px",
          backgroundColor: "#e9ecef",
          color: "#6c757d",
        }}
      >
        -
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">Historial de Últimos 5 Partidos</h5>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "50px" }} className="text-center">
                  Pos
                </th>
                <th>Equipo</th>
                <th className="text-center" style={{ width: "60px" }}>
                  Último
                </th>
                <th className="text-center" style={{ width: "60px" }}>
                  Penúltimo
                </th>
                <th className="text-center" style={{ width: "60px" }}>
                  -3
                </th>
                <th className="text-center" style={{ width: "60px" }}>
                  -4
                </th>
                <th className="text-center" style={{ width: "60px" }}>
                  -5
                </th>
              </tr>
            </thead>
            <tbody>
              {historiales.map((historial, index) => (
                <tr key={historial.equipo}>
                  <td className="text-center align-middle">{index + 1}</td>
                  <td className="align-middle">
                    <div className="d-flex align-items-center">
                      <img
                        src={LOGOS_EQUIPOS[historial.equipo]}
                        alt={historial.equipo}
                        style={{
                          width: "32px",
                          height: "32px",
                          objectFit: "contain",
                          marginRight: "10px",
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                      <span>{historial.equipo}</span>
                    </div>
                  </td>
                  <td className="text-center align-middle">
                    {renderResultado(historial.ultimos_partidos[0])}
                  </td>
                  <td className="text-center align-middle">
                    {renderResultado(historial.ultimos_partidos[1])}
                  </td>
                  <td className="text-center align-middle">
                    {renderResultado(historial.ultimos_partidos[2])}
                  </td>
                  <td className="text-center align-middle">
                    {renderResultado(historial.ultimos_partidos[3])}
                  </td>
                  <td className="text-center align-middle">
                    {renderResultado(historial.ultimos_partidos[4])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LastMatchsNacional;
