import AccesosDirectos from "../components/AccesosDirectos";

export default function CuadroFinal() {
  const predicciones = [
    {
      nombre: "Daniel Guzmán",
      campeon: "Colo-Colo",
      subcampeon: "U. Católica",
      clasificados: ["Palestino", "Cobresal", "Everton", "Audax", "Iquique", "Ñublense"],
      descendidos: ["Coquimbo", "Deportes Limache"],
      goleador: "Fernando Zampedri",
    },
    {
      nombre: "Christian Slater",
      campeon: "U. de Chile",
      subcampeon: "Colo-Colo",
      clasificados: ["Cobresal", "Palestino", "U. Católica", "Everton", "Iquique", "Ñublense"],
      descendidos: ["Copiapó", "La Serena"],
      goleador: "Rodrigo Holgado",
    },
  ];

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      <h2>🏆 Predicciones Finales</h2>
      <div className="table-responsive mt-3">
        <table className="table table-bordered align-middle text-center">
          <thead className="table-dark">
            <tr>
              <th rowSpan="2">Jugador</th>
              <th rowSpan="2">Campeón</th>
              <th rowSpan="2">Subcampeón</th>
              <th colSpan="6">3º al 8º</th>
              <th colSpan="2">Descendidos</th>
              <th rowSpan="2">Goleador</th>
            </tr>
            <tr>
              <th>3º</th><th>4º</th><th>5º</th><th>6º</th><th>7º</th><th>8º</th>
              <th>17º</th><th>18º</th>
            </tr>
          </thead>
          <tbody>
            {predicciones.map((jug, i) => (
              <tr key={i}>
                <td>{jug.nombre}</td>
                <td>{jug.campeon}</td>
                <td>{jug.subcampeon}</td>
                {jug.clasificados.map((equipo, idx) => (
                  <td key={idx}>{equipo}</td>
                ))}
                {jug.descendidos.map((equipo, idx) => (
                  <td key={`desc-${idx}`}>{equipo}</td>
                ))}
                <td>{jug.goleador}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
