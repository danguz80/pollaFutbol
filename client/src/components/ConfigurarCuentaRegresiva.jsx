import { useState } from "react";

export default function ConfigurarCuentaRegresiva({ onConfigurar, loading }) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fecha || !hora) return;
    const fechaHora = new Date(`${fecha}T${hora}:00`);
    onConfigurar({ fechaHora });
  };

  return (
    <form className="mb-4" onSubmit={handleSubmit} style={{ maxWidth: 400, margin: "0 auto" }}>
      <h5 className="mb-3">Configurar fecha y hora de cierre de jornada</h5>
      <div className="row g-2 mb-2">
        <div className="col-6">
          <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="col-6">
          <input type="time" className="form-control" value={hora} onChange={e => setHora(e.target.value)} required />
        </div>
      </div>
      <button className="btn btn-primary w-100" type="submit" disabled={loading}>
        {loading ? "Guardando..." : "Configurar cuenta regresiva"}
      </button>
    </form>
  );
}
