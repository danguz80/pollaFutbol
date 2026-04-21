// pages/Tesoreria.jsx
import { useState, useEffect, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Table,
  Badge,
  Button,
  Form,
  Card,
  Spinner,
  Alert,
} from "react-bootstrap";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const TORNEOS = [
  { key: "torneo_nacional", label: "Torneo Nacional" },
  { key: "libertadores", label: "Copa Libertadores" },
  { key: "sudamericana", label: "Copa Sudamericana" },
  { key: "mundial", label: "Mundial 2026" },
];

const CAMPO_ACTIVO = {
  torneo_nacional: "activo_torneo_nacional",
  libertadores: "activo_libertadores",
  sudamericana: "activo_sudamericana",
  mundial: "activo_mundial",
};

const CAMPO_PAGO = {
  torneo_nacional: "pago_torneo_nacional",
  libertadores: "pago_libertadores",
  sudamericana: "pago_sudamericana",
  mundial: "pago_mundial",
};

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// Formato CLP: 10000 → "10.000"
const formatCLP = (valor) => {
  const num = parseInt(valor, 10);
  if (isNaN(num)) return "";
  return num.toLocaleString("es-CL", { maximumFractionDigits: 0 });
};

// Parseo CLP: "10.000" → 10000
const parseCLP = (str) => {
  const limpio = String(str).replace(/\./g, "").replace(/[^0-9]/g, "");
  return limpio === "" ? "" : parseInt(limpio, 10);
};

export default function Tesoreria() {
  const [usuarios, setUsuarios] = useState([]);
  const [configuracion, setConfiguracion] = useState({});
  const [premios, setPremios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState("");

  // ─── Cargar datos iniciales ───────────────────────────────
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [resUsuarios, resConfig, resPremios] = await Promise.all([
        fetch(`${API_URL}/api/tesoreria/usuarios`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/tesoreria/configuracion`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/tesoreria/premios`, { headers: authHeaders() }),
      ]);

      if (!resUsuarios.ok || !resConfig.ok || !resPremios.ok) {
        throw new Error("Error al cargar datos de tesorería");
      }

      const [dataUsuarios, dataConfig, dataPremios] = await Promise.all([
        resUsuarios.json(),
        resConfig.json(),
        resPremios.json(),
      ]);

      setUsuarios(dataUsuarios);
      // Convertir array de configuración a objeto por torneo
      const cfgMap = {};
      dataConfig.forEach((c) => {
        cfgMap[c.torneo] = {
          cuota: c.cuota ?? 0,
          premio_jornada: c.premio_jornada ?? 0,
          premio_acumulado_1: c.premio_acumulado_1 ?? 0,
          premio_acumulado_2: c.premio_acumulado_2 ?? 0,
          premio_acumulado_3: c.premio_acumulado_3 ?? 0,
          premio_fase_grupos: c.premio_fase_grupos ?? 0,
        };
      });
      setConfiguracion(cfgMap);
      setPremios(dataPremios);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ─── Guardar configuración de un torneo ──────────────────
  const guardarConfiguracion = async (torneo) => {
    setGuardando(true);
    setMensajeOk("");
    try {
      const res = await fetch(`${API_URL}/api/tesoreria/configuracion/${torneo}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(configuracion[torneo] || {}),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setMensajeOk(`✅ Configuración de ${TORNEOS.find((t) => t.key === torneo)?.label} guardada`);
      setTimeout(() => setMensajeOk(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleConfigChange = (torneo, campo, valor) => {
    setConfiguracion((prev) => ({
      ...prev,
      [torneo]: { ...(prev[torneo] || {}), [campo]: valor },
    }));
  };

  // ─── Toggle pago de cuota ────────────────────────────────
  const togglePago = async (usuario_id, torneo) => {
    try {
      const res = await fetch(`${API_URL}/api/tesoreria/pagos`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ usuario_id, torneo }),
      });
      if (!res.ok) throw new Error("Error al actualizar pago");
      const data = await res.json();
      // Actualizar estado local
      setUsuarios((prev) =>
        prev.map((u) => {
          if (u.id !== usuario_id) return u;
          return { ...u, [CAMPO_PAGO[torneo]]: data.pago.cuota_pagada };
        })
      );
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // ─── Marcar todo pagado (columna o fila) ─────────────────
  const pagarTodo = async (pares) => {
    if (pares.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/tesoreria/pagos/bulk`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pares }),
      });
      if (!res.ok) throw new Error("Error al marcar pagos");
      // Actualizar estado local
      setUsuarios((prev) =>
        prev.map((u) => {
          const torneosPago = pares.filter((p) => p.usuario_id === u.id).map((p) => p.torneo);
          if (torneosPago.length === 0) return u;
          const updates = {};
          torneosPago.forEach((t) => { updates[CAMPO_PAGO[t]] = true; });
          return { ...u, ...updates };
        })
      );
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Marcar toda una columna (torneo) como pagada
  const pagarColumna = (torneo) => {
    const pares = usuarios
      .filter((u) => u[CAMPO_ACTIVO[torneo]] && !u[CAMPO_PAGO[torneo]])
      .map((u) => ({ usuario_id: u.id, torneo }));
    pagarTodo(pares);
  };

  // Marcar toda una fila (usuario) como pagada
  const pagarFila = (usuario) => {
    const pares = TORNEOS
      .filter((t) => usuario[CAMPO_ACTIVO[t.key]] && !usuario[CAMPO_PAGO[t.key]])
      .map((t) => ({ usuario_id: usuario.id, torneo: t.key }));
    pagarTodo(pares);
  };

  // ─── Toggle entrega de premio (por clave compuesta) ──────────────────────
  const togglePremioEntregado = async (p) => {
    try {
      const res = await fetch(`${API_URL}/api/tesoreria/premios/toggle`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          usuario_id: p.usuario_id,
          torneo: p.torneo,
          tipo: p.tipo,
          referencia: p.referencia,
          monto: p.monto ?? montoSugerido(p.torneo, p.tipo) ?? 0,
        }),
      });
      if (!res.ok) throw new Error("Error al actualizar premio");
      const data = await res.json();
      setPremios((prev) =>
        prev.map((x) =>
          x.torneo === p.torneo && x.tipo === p.tipo && x.referencia === p.referencia && x.usuario_id === p.usuario_id
            ? { ...x, entregado: data.premio.entregado, fecha_entrega: data.premio.fecha_entrega, premio_id: data.premio.id, monto: data.premio.monto }
            : x
        )
      );
    } catch (err) {
      alert("Error: " + err.message);
    }
  };


  // ─── Monto sugerido según tipo/torneo ─────────────────────
  const montoSugerido = (torneo, tipo) => {
    const cfg = configuracion[torneo] || {};
    const mapa = {
      jornada: cfg.premio_jornada,
      acumulado_1: cfg.premio_acumulado_1,
      acumulado_2: cfg.premio_acumulado_2,
      acumulado_3: cfg.premio_acumulado_3,
      fase_grupos: cfg.premio_fase_grupos,
    };
    return mapa[tipo] ?? "";
  };

  // ─── Estadísticas rápidas ────────────────────────────────
  const stats = TORNEOS.map((t) => {
    const participantes = usuarios.filter((u) => u[CAMPO_ACTIVO[t.key]]);
    const pagaron = participantes.filter((u) => u[CAMPO_PAGO[t.key]]);
    return { ...t, total: participantes.length, pagaron: pagaron.length };
  });

  // ─── Resumen financiero ──────────────────────────────────
  const finanzas = TORNEOS.map((t) => {
    const cfg = configuracion[t.key] || {};
    const pagaron = usuarios.filter((u) => u[CAMPO_ACTIVO[t.key]] && u[CAMPO_PAGO[t.key]]).length;
    const ingresos = pagaron * (cfg.cuota || 0);
    const premiosEntregados = premios
      .filter((p) => p.torneo === t.key && p.entregado)
      .reduce((acc, p) => acc + (p.monto || 0), 0);
    return { ...t, ingresos, premiosEntregados, saldo: ingresos - premiosEntregados };
  });
  const totalIngresos = finanzas.reduce((acc, f) => acc + f.ingresos, 0);
  const totalPremios = finanzas.reduce((acc, f) => acc + f.premiosEntregados, 0);
  const totalSaldo = totalIngresos - totalPremios;

  // ─── Render ──────────────────────────────────────────────
  if (cargando) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" variant="warning" />
        <p className="mt-3">Cargando tesorería...</p>
      </Container>
    );
  }

  return (
    <Container fluid className="py-4">
      <h2 className="mb-1">💰 Tesorería</h2>
      <p className="text-muted mb-4">Gestión de cuotas, pagos y premios del campeonato</p>

      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      {mensajeOk && <Alert variant="success">{mensajeOk}</Alert>}

      {/* ── RESUMEN FINANCIERO ───────────────────────────── */}
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Header className="bg-success text-white fw-bold">
          📊 Resumen Financiero
        </Card.Header>
        <Card.Body className="p-0">
          <Table bordered hover className="mb-0 align-middle" size="sm">
            <thead className="table-dark">
              <tr>
                <th>Torneo</th>
                <th className="text-end">Ingresos (cuotas)</th>
                <th className="text-end">Premios entregados</th>
                <th className="text-end">Saldo remanente</th>
              </tr>
            </thead>
            <tbody>
              {finanzas.map((f) => (
                <tr key={f.key}>
                  <td className="fw-semibold">{f.label}</td>
                  <td className="text-end text-success fw-semibold">${formatCLP(f.ingresos)}</td>
                  <td className="text-end text-danger">${formatCLP(f.premiosEntregados)}</td>
                  <td className={`text-end fw-bold ${f.saldo >= 0 ? "text-success" : "text-danger"}`}>
                    ${formatCLP(f.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="table-secondary fw-bold">
              <tr>
                <td>TOTAL</td>
                <td className="text-end text-success">${formatCLP(totalIngresos)}</td>
                <td className="text-end text-danger">${formatCLP(totalPremios)}</td>
                <td className={`text-end ${totalSaldo >= 0 ? "text-success" : "text-danger"}`}>
                  ${formatCLP(totalSaldo)}
                </td>
              </tr>
            </tfoot>
          </Table>
        </Card.Body>
      </Card>

      {/* ── RESUMEN RÁPIDO ───────────────────────────────── */}
      <Row className="mb-4 g-3">
        {stats.map((s) => (
          <Col key={s.key} xs={6} md={3}>
            <Card className="text-center h-100 border-warning">
              <Card.Body>
                <Card.Title className="fs-6 fw-bold">{s.label}</Card.Title>
                <div className="fs-4 fw-bold text-warning">{s.pagaron}/{s.total}</div>
                <small className="text-muted">pagaron cuota</small>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── CONFIGURACIÓN DE CUOTAS Y PREMIOS ────────────── */}
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Header className="bg-dark text-white fw-bold">
          ⚙️ Configuración de Cuotas y Premios
        </Card.Header>
        <Card.Body>
          <Row className="g-4">
            {TORNEOS.map((t) => {
              const cfg = configuracion[t.key] || {};
              const esMundial = t.key === "mundial";
              return (
                <Col key={t.key} xs={12} md={6} xl={3}>
                  <Card className="h-100 border-secondary">
                    <Card.Header className="fw-semibold">{t.label}</Card.Header>
                    <Card.Body className="d-flex flex-column gap-2">
                      <Form.Group>
                        <Form.Label className="small mb-1">Cuota inscripción ($)</Form.Label>
                        <Form.Control
                          type="text"
                          inputMode="numeric"
                          value={formatCLP(cfg.cuota)}
                          onChange={(e) => handleConfigChange(t.key, "cuota", parseCLP(e.target.value))}
                          size="sm"
                        />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small mb-1">Premio por jornada ($)</Form.Label>
                        <Form.Control
                          type="text"
                          inputMode="numeric"
                          value={formatCLP(cfg.premio_jornada)}
                          onChange={(e) => handleConfigChange(t.key, "premio_jornada", parseCLP(e.target.value))}
                          size="sm"
                        />
                      </Form.Group>
                      {esMundial ? (
                        <>
                          <Form.Group>
                            <Form.Label className="small mb-1">🥇 Premio acumulado 1° ($)</Form.Label>
                            <Form.Control
                              type="text"
                              inputMode="numeric"
                              value={formatCLP(cfg.premio_acumulado_1)}
                              onChange={(e) => handleConfigChange(t.key, "premio_acumulado_1", parseCLP(e.target.value))}
                              size="sm"
                            />
                          </Form.Group>
                          <Form.Group>
                            <Form.Label className="small mb-1">🥈 Premio acumulado 2° ($)</Form.Label>
                            <Form.Control
                              type="text"
                              inputMode="numeric"
                              value={formatCLP(cfg.premio_acumulado_2)}
                              onChange={(e) => handleConfigChange(t.key, "premio_acumulado_2", parseCLP(e.target.value))}
                              size="sm"
                            />
                          </Form.Group>
                          <Form.Group>
                            <Form.Label className="small mb-1">🥉 Premio acumulado 3° ($)</Form.Label>
                            <Form.Control
                              type="text"
                              inputMode="numeric"
                              value={formatCLP(cfg.premio_acumulado_3)}
                              onChange={(e) => handleConfigChange(t.key, "premio_acumulado_3", parseCLP(e.target.value))}
                              size="sm"
                            />
                          </Form.Group>
                          <Form.Group>
                            <Form.Label className="small mb-1">🏅 Premio ganador fase de grupos ($)</Form.Label>
                            <Form.Control
                              type="text"
                              inputMode="numeric"
                              value={formatCLP(cfg.premio_fase_grupos)}
                              onChange={(e) => handleConfigChange(t.key, "premio_fase_grupos", parseCLP(e.target.value))}
                              size="sm"
                            />
                          </Form.Group>
                        </>
                      ) : (
                        <Form.Group>
                          <Form.Label className="small mb-1">Premio acumulado ($)</Form.Label>
                          <Form.Control
                            type="text"
                            inputMode="numeric"
                            value={formatCLP(cfg.premio_acumulado_1)}
                            onChange={(e) => handleConfigChange(t.key, "premio_acumulado_1", parseCLP(e.target.value))}
                            size="sm"
                          />
                        </Form.Group>
                      )}
                      <Button
                        variant="warning"
                        size="sm"
                        className="mt-auto fw-bold"
                        disabled={guardando}
                        onClick={() => guardarConfiguracion(t.key)}
                      >
                        Guardar
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card.Body>
      </Card>

      {/* ── TABLA DE PAGOS DE USUARIOS ────────────────────── */}
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Header className="bg-dark text-white fw-bold">
          👥 Estado de Pagos por Usuario
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table striped bordered hover className="mb-0 align-middle" size="sm">
              <thead className="table-dark">
                <tr>
                  <th>Usuario</th>
                  {TORNEOS.map((t) => {
                    const pendientesCol = usuarios.filter(
                      (u) => u[CAMPO_ACTIVO[t.key]] && !u[CAMPO_PAGO[t.key]]
                    ).length;
                    return (
                      <th key={t.key} className="text-center">
                        <div>{t.label}</div>
                        {pendientesCol > 0 && (
                          <Button
                            variant="outline-warning"
                            size="sm"
                            className="mt-1 py-0 px-1"
                            style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                            onClick={() => pagarColumna(t.key)}
                            title={`Marcar ${pendientesCol} pendiente(s) como pagado`}
                          >
                            ✔ Todo pagado
                          </Button>
                        )}
                      </th>
                    );
                  })}
                  <th className="text-center">Acción fila</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-3">
                      No hay usuarios registrados
                    </td>
                  </tr>
                )}
                {usuarios.map((u) => {
                  const pendientesFila = TORNEOS.filter(
                    (t) => u[CAMPO_ACTIVO[t.key]] && !u[CAMPO_PAGO[t.key]]
                  ).length;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="fw-semibold">{u.nombre}</div>
                        <small className="text-muted">{u.email}</small>
                      </td>
                      {TORNEOS.map((t) => {
                        const participa = u[CAMPO_ACTIVO[t.key]];
                        const pago = u[CAMPO_PAGO[t.key]];
                        return (
                          <td key={t.key} className="text-center">
                            {participa ? (
                              <Button
                                variant={pago ? "success" : "outline-danger"}
                                size="sm"
                                onClick={() => togglePago(u.id, t.key)}
                                title={pago ? "Marcar como no pagado" : "Marcar como pagado"}
                              >
                                {pago ? "✅ Pagado" : "❌ Pendiente"}
                              </Button>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center">
                        {pendientesFila > 0 ? (
                          <Button
                            variant="outline-warning"
                            size="sm"
                            onClick={() => pagarFila(u)}
                            title={`Marcar ${pendientesFila} torneo(s) pendiente(s) como pagado`}
                          >
                            ✔ Todo pagado
                          </Button>
                        ) : (
                          <span className="text-success small fw-bold">✅ Al día</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      {/* ── PREMIOS (auto-generados desde ganadores reales) ── */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-dark text-white fw-bold">
          🏆 Premios por Entregar — generados automáticamente desde ganadores registrados
        </Card.Header>
        <Card.Body className="p-0">
          {premios.length === 0 ? (
            <div className="text-center text-muted py-4">
              Aún no hay ganadores registrados en ningún torneo.
            </div>
          ) : (
            <TablaPremiosPorTorneo
              premios={premios}
              configuracion={configuracion}
              montoSugerido={montoSugerido}
              togglePremioEntregado={togglePremioEntregado}
            />
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}

// ── Sub-componente: agrupa premios por torneo y muestra tabla ─────────────
function TablaPremiosPorTorneo({ premios, configuracion, montoSugerido, togglePremioEntregado }) {
  const TORNEOS_LABEL = {
    torneo_nacional: "Torneo Nacional",
    libertadores: "Copa Libertadores",
    sudamericana: "Copa Sudamericana",
    mundial: "Mundial 2026",
  };

  const TIPO_ORDEN = { jornada: 0, fase_grupos: 1, acumulado_1: 2, acumulado_2: 3, acumulado_3: 4 };

  // Agrupar por torneo
  const porTorneo = {};
  premios.forEach((p) => {
    if (!porTorneo[p.torneo]) porTorneo[p.torneo] = [];
    porTorneo[p.torneo].push(p);
  });

  return (
    <>
      {Object.entries(porTorneo).map(([torneo, filas]) => {
        const pendientes = filas.filter((f) => !f.entregado).length;
        return (
          <div key={torneo} className="mb-0">
            <div className="px-3 pt-3 pb-1 d-flex align-items-center gap-2">
              <span className="fw-bold fs-6">{TORNEOS_LABEL[torneo] || torneo}</span>
              {pendientes > 0 ? (
                <Badge bg="warning" text="dark">{pendientes} pendiente{pendientes > 1 ? "s" : ""}</Badge>
              ) : (
                <Badge bg="success">Todo entregado ✅</Badge>
              )}
            </div>
            <div className="table-responsive">
              <Table striped bordered hover className="mb-0 align-middle" size="sm">
                <thead className="table-secondary">
                  <tr>
                    <th>Tipo</th>
                    <th>Referencia</th>
                    <th>Ganador</th>
                    <th className="text-end">Monto</th>
                    <th className="text-center">Estado entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Contar ganadores por referencia (para dividir el monto)
                    const ganadoresPorRef = {};
                    filas.forEach((p) => {
                      const k = `${p.tipo}|${p.referencia}`;
                      ganadoresPorRef[k] = (ganadoresPorRef[k] || 0) + 1;
                    });
                    // Ordenar: por tipo, luego por número en referencia
                    const filasOrdenadas = [...filas].sort((a, b) => {
                      const ta = TIPO_ORDEN[a.tipo] ?? 99;
                      const tb = TIPO_ORDEN[b.tipo] ?? 99;
                      if (ta !== tb) return ta - tb;
                      const na = parseInt(a.referencia.replace(/\D/g, ""), 10);
                      const nb = parseInt(b.referencia.replace(/\D/g, ""), 10);
                      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
                      return (a.ganador_nombre || "").localeCompare(b.ganador_nombre || "");
                    });
                    return filasOrdenadas.map((p, i) => {
                      const k = `${p.tipo}|${p.referencia}`;
                      const nGanadores = ganadoresPorRef[k] || 1;
                      // Solo se considera "ya guardado" si el premio está entregado Y tiene monto.
                      // Si está pendiente (entregado=false), siempre recalcula desde la configuración.
                      const montoYaGuardado = p.entregado && p.monto != null && Number(p.monto) > 0;
                      const montoBase = montoYaGuardado
                        ? Number(p.monto)
                        : Number(montoSugerido(p.torneo, p.tipo) || 0);
                      // Solo dividir cuando NO hay monto guardado (usamos el sugerido de config)
                      const montoPorGanador = (!montoYaGuardado && nGanadores > 1)
                        ? Math.floor(montoBase / nGanadores)
                        : montoBase;
                      const mostrarDivision = !montoYaGuardado && nGanadores > 1;
                      return (
                        <tr key={i} className={p.entregado ? "table-success" : ""}>
                          <td><TipoPremioLabel tipo={p.tipo} /></td>
                          <td>{p.referencia}</td>
                          <td className="fw-semibold">{p.ganador_nombre}</td>
                          <td className="text-end">
                            {montoPorGanador > 0 ? (
                              <>
                                ${montoPorGanador.toLocaleString("es-CL", { maximumFractionDigits: 0 })}
                                {mostrarDivision && (
                                  <span className="text-muted small ms-1">(÷{nGanadores})</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted small">sin configurar</span>
                            )}
                          </td>
                          <td className="text-center">
                            <Button
                              variant={p.entregado ? "success" : "outline-warning"}
                              size="sm"
                              onClick={() => togglePremioEntregado({ ...p, monto: montoPorGanador })}
                            >
                              {p.entregado ? "✅ Entregado" : "⏳ Pendiente"}
                            </Button>
                            {p.entregado && p.fecha_entrega && (
                              <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                {new Date(p.fecha_entrega).toLocaleDateString("es-CL")}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </Table>
            </div>
          </div>
        );
      })}
    </>
  );
}

function TipoPremioLabel({ tipo }) {
  const map = {
    jornada: "🏅 Jornada",
    acumulado_1: "🥇 Acumulado 1°",
    acumulado_2: "🥈 Acumulado 2°",
    acumulado_3: "🥉 Acumulado 3°",
  };
  return <span>{map[tipo] || tipo}</span>;
}
