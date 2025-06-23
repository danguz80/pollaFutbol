import { useState } from "react";

export default function FormularioPronostico({ onSubmit }) {
  const [signo, setSigno] = useState("");
  const [golesLocal, setGolesLocal] = useState("");
  const [golesVisita, setGolesVisita] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ signo, golesLocal, golesVisita });
  };

  return (
    <form onSubmit={handleSubmit} className="row g-2 mt-3">
      <div className="col-md-2">
        <select className="form-select" value={signo} onChange={(e) => setSigno(e.target.value)}>
          <option value="">Signo</option>
          <option value="1">Local</option>
          <option value="0">Empate</option>
          <option value="2">Visita</option>
        </select>
      </div>
      <div className="col-md-2">
        <input type="number" className="form-control" placeholder="Goles Local" value={golesLocal} onChange={(e) => setGolesLocal(e.target.value)} />
      </div>
      <div className="col-md-2">
        <input type="number" className="form-control" placeholder="Goles Visita" value={golesVisita} onChange={(e) => setGolesVisita(e.target.value)} />
      </div>
      <div className="col-md-2">
        <button type="submit" className="btn btn-primary">Guardar</button>
      </div>
    </form>
  );
}
