import { useState } from "react";

export default function ConfigurarCuentaRegresiva({ onConfigurar, loading }) {
  const [dias, setDias] = useState(0);
  const [horas, setHoras] = useState(0);
  const [minutos, setMinutos] = useState(0);
  const [segundos, setSegundos] = useState(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfigurar({ dias, horas, minutos, segundos });
  };

  return (
    <form className="mb-4" onSubmit={handleSubmit} style={{ maxWidth: 400, margin: "0 auto" }}>
      <h5 className="mb-3">Configurar cuenta regresiva para cierre de jornada</h5>
      <div className="row g-2 mb-2">
        <div className="col">
          <input type="number" className="form-control" min="0" value={dias} onChange={e => setDias(Number(e.target.value))} placeholder="Días" />
        </div>
        <div className="col">
          <input type="number" className="form-control" min="0" max="23" value={horas} onChange={e => setHoras(Number(e.target.value))} placeholder="Horas" />
        </div>
        <div className="col">
          <input type="number" className="form-control" min="0" max="59" value={minutos} onChange={e => setMinutos(Number(e.target.value))} placeholder="Minutos" />
        </div>
        <div className="col">
          <input type="number" className="form-control" min="0" max="59" value={segundos} onChange={e => setSegundos(Number(e.target.value))} placeholder="Segundos" />
        </div>
      </div>
      <button className="btn btn-primary w-100" type="submit" disabled={loading}>
        {loading ? "Guardando..." : "Configurar cuenta regresiva"}
      </button>
    </form>
  );
}
