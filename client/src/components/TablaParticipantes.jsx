export default function TablaParticipantes({ data }) {
  return (
    <div className="table-responsive mt-4">
      <table className="table table-striped table-bordered">
        <thead className="table-dark">
          <tr>
            <th>Ranking</th>
            <th>Jugador</th>
            <th>Puntaje</th>
          </tr>
        </thead>
        <tbody>
          {data.map((jugador, index) => (
            <tr key={index}>
              <td>{jugador.ranking}</td>
              <td>{jugador.nombre}</td>
              <td>{jugador.puntaje}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
