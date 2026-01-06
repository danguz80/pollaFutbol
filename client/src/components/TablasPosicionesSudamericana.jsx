import { LogoEquipo } from '../utils/sudamericanaLogos.jsx';

export default function TablasPosicionesSudamericana({ estadisticas, colorTema = 'success' }) {
  if (!estadisticas || Object.keys(estadisticas).length === 0) {
    return null;
  }

  const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const bgColor = colorTema === 'success' ? 'bg-success' : 'bg-danger';

  return (
    <div style={{ position: 'sticky', top: '80px' }}>
      <h5 className="fw-bold mb-3">📊 Tabla de Posiciones</h5>
      <div className="d-flex flex-column gap-3" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
        {grupos.map(grupo => {
          const equiposGrupo = estadisticas[grupo] || [];
          if (equiposGrupo.length === 0) return null;
          
          return (
            <div key={grupo} className="card shadow-sm">
              <div className={`card-header ${bgColor} text-white py-2`}>
                <h6 className="mb-0 fw-bold">GRUPO {grupo}</h6>
              </div>
              <div className="card-body p-0">
                <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="text-center" style={{ width: '25px' }}>#</th>
                      <th>Equipo</th>
                      <th className="text-center" style={{ width: '30px' }}>PJ</th>
                      <th className="text-center" style={{ width: '30px' }}>DIF</th>
                      <th className="text-center fw-bold" style={{ width: '30px' }}>PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equiposGrupo.map((equipo, index) => (
                      <tr key={equipo.nombre} className={index < 2 ? 'table-success' : ''}>
                        <td className="text-center fw-bold">{equipo.posicion}</td>
                        <td className="small">
                          <div className="d-flex align-items-center">
                            <LogoEquipo nombre={equipo.nombre} style={{ width: '20px', height: '20px', marginRight: '6px' }} />
                            {equipo.nombre.length > 15 ? equipo.nombre.substring(0, 15) + '...' : equipo.nombre}
                          </div>
                        </td>
                        <td className="text-center">{equipo.pj}</td>
                        <td className="text-center">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                        <td className="text-center fw-bold">{equipo.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
