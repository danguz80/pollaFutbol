import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CuentaRegresivaGlobal from "./CuentaRegresivaGlobal";
import HeroSection from "./HeroSection";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function Home() {
    const navigate = useNavigate();
    const [rankingCampeonato, setRankingCampeonato] = useState([]);
    const [rankingLibertadores, setRankingLibertadores] = useState([]);
    const [rankingSudamericana, setRankingSudamericana] = useState([]);
    const [fotoPerfilMap, setFotoPerfilMap] = useState({});
    const [usuarios, setUsuarios] = useState([]);
    const [mostrarAdmin, setMostrarAdmin] = useState(false);
    const [usuarioEditando, setUsuarioEditando] = useState(null);
    const [formNuevo, setFormNuevo] = useState({ nombre: '', email: '', password: '', rol: 'jugador' });
    const [modoEdicionMasiva, setModoEdicionMasiva] = useState(false);
    const [usuariosEditandoMasivo, setUsuariosEditandoMasivo] = useState([]);

    // Chequeo rápido si hay usuario logueado en localStorage
    const getUsuario = () => {
        try {
            return JSON.parse(localStorage.getItem("usuario"));
        } catch {
            return null;
        }
    };

    const usuario = getUsuario();
    const esAdmin = usuario && usuario.rol === 'admin';

    useEffect(() => {
        const currentUser = getUsuario();
        
        if (currentUser) {
            const token = localStorage.getItem('token');
            
            // Ranking Campeonato (Torneo Nacional)
            fetch(`${API_BASE_URL}/api/pronosticos/ranking/general`)
                .then(res => res.json())
                .then(data => {
                    setRankingCampeonato(data);
                    // Mapear fotos de ranking campeonato
                    setFotoPerfilMap(prev => {
                        const map = { ...prev };
                        data.forEach(u => { map[u.usuario] = u.foto_perfil; });
                        return map;
                    });
                });

            // Ranking Libertadores
            fetch(`${API_BASE_URL}/api/libertadores-rankings/actual`, {
                headers: { 
                    'Authorization': `Bearer ${token}` 
                }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.ranking) {
                        setRankingLibertadores(data.ranking);
                        // Mapear fotos de ranking libertadores (usa 'nombre' en lugar de 'nombre_usuario')
                        setFotoPerfilMap(prev => {
                            const map = { ...prev };
                            data.ranking.forEach(u => { 
                                map[u.nombre] = u.foto_perfil; 
                            });
                            return map;
                        });
                    }
                })
                .catch(err => console.error('Error al cargar ranking Libertadores:', err));

            // Ranking Sudamericana
            fetch(`${API_BASE_URL}/api/sudamericana-rankings/actual`, {
                headers: { 
                    'Authorization': `Bearer ${token}` 
                }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.ranking) {
                        setRankingSudamericana(data.ranking);
                        // Mapear fotos de ranking sudamericana
                        setFotoPerfilMap(prev => {
                            const map = { ...prev };
                            data.ranking.forEach(u => { 
                                map[u.nombre] = u.foto_perfil; 
                            });
                            return map;
                        });
                    }
                })
                .catch(err => console.error('Error al cargar ranking Sudamericana:', err));

            // Si es admin, cargar todos los usuarios
            if (currentUser.rol === 'admin') {
                cargarUsuarios();
            }
        }
    }, []); // Solo ejecutar una vez al montar el componente

    const cargarUsuarios = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/usuarios/admin`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) {
                console.warn('No se pudo cargar usuarios admin');
                return;
            }
            
            const data = await res.json();
            setUsuarios(data);
        } catch (error) {
            console.warn('Error cargando usuarios:', error);
        }
    };

    const handleCrearUsuario = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/usuarios/register`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formNuevo)
            });
            
            if (res.ok) {
                alert('✅ Usuario creado exitosamente');
                setFormNuevo({ nombre: '', email: '', password: '', rol: 'jugador' });
                cargarUsuarios();
            } else {
                const error = await res.json();
                alert('❌ Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error al crear usuario:', error);
            alert('❌ Error al crear usuario');
        }
    };

    const handleActualizarUsuario = async () => {
        if (!usuarioEditando) return;
        
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/admin/actualizar-usuario/${usuarioEditando.id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nombre: usuarioEditando.nombre,
                    email: usuarioEditando.email,
                    rol: usuarioEditando.rol,
                    activo: usuarioEditando.activo,
                    foto_perfil: usuarioEditando.foto_perfil || null,
                    activo_torneo_nacional: usuarioEditando.activo_torneo_nacional,
                    activo_libertadores: usuarioEditando.activo_libertadores,
                    activo_sudamericana: usuarioEditando.activo_sudamericana,
                    activo_copa_mundo: usuarioEditando.activo_copa_mundo
                })
            });
            
            if (res.ok) {
                alert('✅ Usuario actualizado');
                
                // Si el usuario editado es el mismo que está logueado, actualizar localStorage
                if (usuario && usuarioEditando.id === usuario.id) {
                    const usuarioActualizado = {
                        ...usuario,
                        nombre: usuarioEditando.nombre,
                        email: usuarioEditando.email,
                        rol: usuarioEditando.rol,
                        activo: usuarioEditando.activo,
                        foto_perfil: usuarioEditando.foto_perfil,
                        activo_torneo_nacional: usuarioEditando.activo_torneo_nacional,
                        activo_libertadores: usuarioEditando.activo_libertadores,
                        activo_sudamericana: usuarioEditando.activo_sudamericana,
                        activo_copa_mundo: usuarioEditando.activo_copa_mundo
                    };
                    localStorage.setItem('usuario', JSON.stringify(usuarioActualizado));
                    console.log('✅ Usuario actualizado en localStorage:', usuarioActualizado);
                }
                
                setUsuarioEditando(null);
                cargarUsuarios();
            } else {
                alert('❌ Error al actualizar usuario');
            }
        } catch (error) {
            console.error('Error al actualizar usuario:', error);
            alert('❌ Error al actualizar usuario');
        }
    };

    const handleEliminarUsuario = async (id, nombre) => {
        if (!confirm(`¿Estás seguro de eliminar al usuario "${nombre}"?`)) return;
        
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/admin/eliminar-usuario/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                alert('✅ Usuario eliminado');
                cargarUsuarios();
            } else {
                const error = await res.json();
                alert('❌ Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            alert('❌ Error al eliminar usuario');
        }
    };

    const handleToggleActivo = async (id, activoActual) => {
        try {
            const token = localStorage.getItem('token');
            const endpoint = activoActual 
                ? `${API_BASE_URL}/api/admin/desactivar-usuario/${id}`
                : `${API_BASE_URL}/api/admin/activar-usuario/${id}`;
            
            const res = await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                cargarUsuarios();
            }
        } catch (error) {
            console.error('Error al cambiar estado:', error);
        }
    };

    // Activar modo edición masiva
    const handleActivarEdicionMasiva = () => {
        setModoEdicionMasiva(true);
        setUsuariosEditandoMasivo([...usuarios]); // Clonar array de usuarios
        setUsuarioEditando(null); // Desactivar edición individual
    };

    // Cancelar modo edición masiva
    const handleCancelarEdicionMasiva = () => {
        if (confirm('¿Cancelar todos los cambios pendientes?')) {
            setModoEdicionMasiva(false);
            setUsuariosEditandoMasivo([]);
        }
    };

    // Actualizar un campo de un usuario específico en modo masivo
    const handleCambioMasivo = (index, campo, valor) => {
        const nuevosUsuarios = [...usuariosEditandoMasivo];
        nuevosUsuarios[index] = {
            ...nuevosUsuarios[index],
            [campo]: valor
        };
        setUsuariosEditandoMasivo(nuevosUsuarios);
    };

    // Guardar todos los usuarios editados
    const handleGuardarTodosMasivo = async () => {
        if (!confirm(`¿Guardar cambios de ${usuariosEditandoMasivo.length} usuarios?`)) return;

        const token = localStorage.getItem('token');
        let exitosos = 0;
        let fallidos = 0;

        for (let i = 0; i < usuariosEditandoMasivo.length; i++) {
            const u = usuariosEditandoMasivo[i];
            
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/actualizar-usuario/${u.id}`, {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        nombre: u.nombre,
                        email: u.email,
                        rol: u.rol,
                        activo: u.activo,
                        foto_perfil: u.foto_perfil || null,
                        activo_torneo_nacional: u.activo_torneo_nacional,
                        activo_libertadores: u.activo_libertadores,
                        activo_sudamericana: u.activo_sudamericana,
                        activo_copa_mundo: u.activo_copa_mundo
                    })
                });
                
                if (res.ok) {
                    exitosos++;
                } else {
                    fallidos++;
                    console.error(`Error al actualizar usuario ${u.nombre}`);
                }
            } catch (error) {
                fallidos++;
                console.error(`Error al actualizar usuario ${u.nombre}:`, error);
            }
        }

        alert(`✅ Guardados: ${exitosos}\n❌ Errores: ${fallidos}`);
        
        // Actualizar localStorage si el usuario logueado fue editado
        const usuarioActual = getUsuario();
        if (usuarioActual) {
            const usuarioEditado = usuariosEditandoMasivo.find(u => u.id === usuarioActual.id);
            if (usuarioEditado) {
                localStorage.setItem('usuario', JSON.stringify(usuarioEditado));
            }
        }

        setModoEdicionMasiva(false);
        setUsuariosEditandoMasivo([]);
        cargarUsuarios();
    };

    // Componente de Top 3
    const Top3Component = ({ title, ranking, emoji }) => {
        const top3 = ranking.slice(0, 3);
        
        if (top3.length === 0) return null;

        return (
            <div className="mb-4">
                <h4 className="text-center">{emoji} {title}</h4>
                <div className="d-flex justify-content-center gap-4 flex-wrap">
                    {top3.map((p, idx) => {
                        // Manejar diferentes estructuras de datos
                        const usuario = p.usuario || p.nombre || p.nombre_usuario;
                        const puntaje = p.puntaje_total || p.puntaje || p.puntos_acumulados || p.total;
                        const key = p.usuario_id || p.id || usuario;
                        
                        return (
                            <div key={key} className="text-center" style={{ minWidth: 120 }}>
                                {fotoPerfilMap[usuario] && (
                                    <img
                                        src={fotoPerfilMap[usuario].startsWith('/') ? fotoPerfilMap[usuario] : `/perfil/${fotoPerfilMap[usuario]}`}
                                        alt={`Foto de ${usuario}`}
                                        style={{
                                            width: 60,
                                            height: 60,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            border: '2px solid #ddd',
                                            objectPosition: 'center 30%'
                                        }}
                                    />
                                )}
                                <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginTop: 6 }}>{usuario}</div>
                                <div style={{ color: '#888' }}>{puntaje} pts</div>
                                <div style={{ fontSize: '1.2em', color: '#f7c948', fontWeight: 'bold' }}>{idx + 1}°</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="container text-center mt-5">
            <h1 className="mb-4">🏠 Home - Bienvenido a Polla de Torneos</h1>

            {/* Botones de acceso directo al campeonato - ARRIBA */}
            <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3 mb-4">
                <button
                    className="btn btn-primary px-4 py-2"
                    onClick={() => navigate("/campeonato")}
                >
                    🏆 Campeonato Nacional
                </button>
                <button
                    className="btn btn-danger px-4 py-2"
                    onClick={() => navigate("/libertadores")}
                >
                    🔴 Copa Libertadores 2026
                </button>
                <button
                    className="btn btn-success px-4 py-2"
                    onClick={() => navigate("/sudamericana")}
                >
                    🟢 Copa Sudamericana 2026
                </button>
            </div>

            {/* Hero Section con partidos destacados - DEBAJO DE BOTONES */}
            {usuario && <HeroSection />}

            {usuario && (
                <>
                    {/* Cuenta Regresiva Campeonato */}
                    <CuentaRegresivaGlobal />

                    {/* Top 3 Ranking Torneo Nacional - Solo si hay puntos */}
                    {rankingCampeonato.length > 0 && rankingCampeonato[0]?.puntaje_total > 0 && (
                        <Top3Component 
                            title="Top 3 Torneo Nacional" 
                            ranking={rankingCampeonato} 
                            emoji="🏆"
                        />
                    )}

                    {/* Top 3 Ranking Libertadores - Solo si hay puntos */}
                    {rankingLibertadores.length > 0 && rankingLibertadores[0]?.puntos_acumulados > 0 && (
                        <Top3Component 
                            title="Top 3 Copa Libertadores" 
                            ranking={rankingLibertadores} 
                            emoji="🔴"
                        />
                    )}

                    {/* Top 3 Ranking Sudamericana - Solo si hay puntos */}
                    {rankingSudamericana.length > 0 && rankingSudamericana[0]?.puntos_acumulados > 0 && (
                        <Top3Component 
                            title="Top 3 Copa Sudamericana" 
                            ranking={rankingSudamericana} 
                            emoji="🟢"
                        />
                    )}

                    {/* SECCIÓN DE ADMINISTRACIÓN DE USUARIOS - SOLO ADMIN */}
                    {esAdmin && (
                        <div className="mt-5 mb-4">
                            <button 
                                className="btn btn-primary btn-lg"
                                onClick={() => setMostrarAdmin(!mostrarAdmin)}
                            >
                                {mostrarAdmin ? '🔒 Ocultar' : '👥'} Administración de Usuarios
                            </button>

                            {mostrarAdmin && (
                                <div className="card mt-3" style={{ maxWidth: 1400, margin: '20px auto' }}>
                                    <div className="card-body">
                                        <h3 className="card-title">👥 Gestión de Usuarios</h3>
                                        
                                        {/* Leyenda */}
                                        <div className="alert alert-info mb-3">
                                            <strong>📋 Instrucciones:</strong> Haz clic en "✏️" para editar un usuario. 
                                            Marca los checkboxes para activar/desactivar al usuario en cada competición específica.
                                            <br/>
                                            <strong>Competiciones:</strong> 🏆 Nacional | 🔴 Libertadores | 🟢 Sudamericana | 🌍 Copa del Mundo
                                        </div>

                                        {/* Botones de modo edición masiva */}
                                        <div className="mb-3 d-flex gap-2 justify-content-end">
                                            {!modoEdicionMasiva ? (
                                                <button 
                                                    className="btn btn-warning"
                                                    onClick={handleActivarEdicionMasiva}
                                                    disabled={usuarios.length === 0}
                                                >
                                                    📝 Modo Edición General
                                                </button>
                                            ) : (
                                                <>
                                                    <button 
                                                        className="btn btn-success"
                                                        onClick={handleGuardarTodosMasivo}
                                                    >
                                                        💾 Guardar Todos ({usuariosEditandoMasivo.length})
                                                    </button>
                                                    <button 
                                                        className="btn btn-secondary"
                                                        onClick={handleCancelarEdicionMasiva}
                                                    >
                                                        ❌ Cancelar
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        
                                        {/* Formulario para crear nuevo usuario */}
                                        <div className="mb-4 p-3 border rounded bg-light">
                                            <h5>➕ Crear Nuevo Usuario</h5>
                                            <form onSubmit={handleCrearUsuario} className="row g-2">
                                                <div className="col-md-3">
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        placeholder="Nombre"
                                                        value={formNuevo.nombre}
                                                        onChange={(e) => setFormNuevo({...formNuevo, nombre: e.target.value})}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-3">
                                                    <input
                                                        type="email"
                                                        className="form-control"
                                                        placeholder="Email"
                                                        value={formNuevo.email}
                                                        onChange={(e) => setFormNuevo({...formNuevo, email: e.target.value})}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-2">
                                                    <input
                                                        type="password"
                                                        className="form-control"
                                                        placeholder="Contraseña"
                                                        value={formNuevo.password}
                                                        onChange={(e) => setFormNuevo({...formNuevo, password: e.target.value})}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-2">
                                                    <select
                                                        className="form-select"
                                                        value={formNuevo.rol}
                                                        onChange={(e) => setFormNuevo({...formNuevo, rol: e.target.value})}
                                                    >
                                                        <option value="jugador">Jugador</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </div>
                                                <div className="col-md-2">
                                                    <button type="submit" className="btn btn-success w-100">
                                                        ➕ Crear
                                                    </button>
                                                </div>
                                            </form>
                                        </div>

                                        {/* Tabla de usuarios */}
                                        <div className="table-responsive">
                                            <table className="table table-hover table-bordered table-sm">
                                                <thead className="table-dark">
                                                    <tr>
                                                        <th>ID</th>
                                                        <th>Foto</th>
                                                        <th>Nombre</th>
                                                        <th>Email</th>
                                                        <th>Rol</th>
                                                        <th>General</th>
                                                        <th>🏆 Nacional</th>
                                                        <th>🔴 Libertadores</th>
                                                        <th>🟢 Sudamericana</th>
                                                        <th>🌍 Mundial</th>
                                                        <th>Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modoEdicionMasiva ? (
                                                        // Modo edición masiva - todos los usuarios editables
                                                        usuariosEditandoMasivo.map((u, index) => (
                                                            <tr key={u.id} className="table-info">
                                                                <td>{u.id}</td>
                                                                <td>
                                                                    <div>
                                                                        {u.foto_perfil && (
                                                                            <img
                                                                                src={u.foto_perfil.startsWith('/') ? u.foto_perfil : `/perfil/${u.foto_perfil}`}
                                                                                alt="Perfil"
                                                                                style={{
                                                                                    width: 40,
                                                                                    height: 40,
                                                                                    borderRadius: '50%',
                                                                                    objectFit: 'cover',
                                                                                    border: '2px solid #ddd',
                                                                                    objectPosition: 'center 30%',
                                                                                    marginBottom: 5
                                                                                }}
                                                                            />
                                                                        )}
                                                                        <input
                                                                            type="text"
                                                                            className="form-control form-control-sm"
                                                                            placeholder="nombre_foto.jpg"
                                                                            value={u.foto_perfil || ''}
                                                                            onChange={(e) => handleCambioMasivo(index, 'foto_perfil', e.target.value)}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="text"
                                                                        className="form-control form-control-sm"
                                                                        value={u.nombre}
                                                                        onChange={(e) => handleCambioMasivo(index, 'nombre', e.target.value)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="email"
                                                                        className="form-control form-control-sm"
                                                                        value={u.email}
                                                                        onChange={(e) => handleCambioMasivo(index, 'email', e.target.value)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        className="form-select form-select-sm"
                                                                        value={u.rol}
                                                                        onChange={(e) => handleCambioMasivo(index, 'rol', e.target.value)}
                                                                    >
                                                                        <option value="jugador">Jugador</option>
                                                                        <option value="admin">Admin</option>
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={u.activo}
                                                                        onChange={(e) => handleCambioMasivo(index, 'activo', e.target.checked)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={u.activo_torneo_nacional || false}
                                                                        onChange={(e) => handleCambioMasivo(index, 'activo_torneo_nacional', e.target.checked)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={u.activo_libertadores || false}
                                                                        onChange={(e) => handleCambioMasivo(index, 'activo_libertadores', e.target.checked)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={u.activo_sudamericana || false}
                                                                        onChange={(e) => handleCambioMasivo(index, 'activo_sudamericana', e.target.checked)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={u.activo_copa_mundo || false}
                                                                        onChange={(e) => handleCambioMasivo(index, 'activo_copa_mundo', e.target.checked)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <span className="text-muted small">Edición masiva</span>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        // Modo normal - edición individual
                                                        usuarios.map(u => (
                                                        usuarioEditando?.id === u.id ? (
                                                            // Modo edición
                                                            <tr key={u.id} className="table-warning">
                                                                <td>{u.id}</td>
                                                                <td>
                                                                    <div>
                                                                        {usuarioEditando.foto_perfil && (
                                                                            <img
                                                                                src={usuarioEditando.foto_perfil.startsWith('/') ? usuarioEditando.foto_perfil : `/perfil/${usuarioEditando.foto_perfil}`}
                                                                                alt="Perfil"
                                                                                style={{
                                                                                    width: 40,
                                                                                    height: 40,
                                                                                    borderRadius: '50%',
                                                                                    objectFit: 'cover',
                                                                                    border: '2px solid #ddd',
                                                                                    objectPosition: 'center 30%',
                                                                                    marginBottom: 5
                                                                                }}
                                                                            />
                                                                        )}
                                                                        <input
                                                                            type="text"
                                                                            className="form-control form-control-sm"
                                                                            placeholder="nombre_foto.jpg"
                                                                            value={usuarioEditando.foto_perfil || ''}
                                                                            onChange={(e) => setUsuarioEditando({...usuarioEditando, foto_perfil: e.target.value})}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="text"
                                                                        className="form-control form-control-sm"
                                                                        value={usuarioEditando.nombre}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, nombre: e.target.value})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="email"
                                                                        className="form-control form-control-sm"
                                                                        value={usuarioEditando.email}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, email: e.target.value})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        className="form-select form-select-sm"
                                                                        value={usuarioEditando.rol}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, rol: e.target.value})}
                                                                    >
                                                                        <option value="jugador">Jugador</option>
                                                                        <option value="admin">Admin</option>
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={usuarioEditando.activo}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, activo: e.target.checked})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={usuarioEditando.activo_torneo_nacional || false}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, activo_torneo_nacional: e.target.checked})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={usuarioEditando.activo_libertadores || false}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, activo_libertadores: e.target.checked})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={usuarioEditando.activo_sudamericana || false}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, activo_sudamericana: e.target.checked})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="form-check-input"
                                                                        checked={usuarioEditando.activo_copa_mundo || false}
                                                                        onChange={(e) => setUsuarioEditando({...usuarioEditando, activo_copa_mundo: e.target.checked})}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <button 
                                                                        className="btn btn-sm btn-success me-1"
                                                                        onClick={handleActualizarUsuario}
                                                                    >
                                                                        ✅
                                                                    </button>
                                                                    <button 
                                                                        className="btn btn-sm btn-secondary"
                                                                        onClick={() => setUsuarioEditando(null)}
                                                                    >
                                                                        ❌
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            // Modo vista
                                                            <tr key={u.id}>
                                                                <td>{u.id}</td>
                                                                <td className="text-center">
                                                                    {u.foto_perfil ? (
                                                                        <img
                                                                            src={u.foto_perfil.startsWith('/') ? u.foto_perfil : `/perfil/${u.foto_perfil}`}
                                                                            alt="Perfil"
                                                                            style={{
                                                                                width: 40,
                                                                                height: 40,
                                                                                borderRadius: '50%',
                                                                                objectFit: 'cover',
                                                                                border: '2px solid #ddd',
                                                                                objectPosition: 'center 30%'
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <div style={{
                                                                            width: 40,
                                                                            height: 40,
                                                                            borderRadius: '50%',
                                                                            backgroundColor: '#ccc',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontSize: '1.2em',
                                                                            color: '#666'
                                                                        }}>
                                                                            {u.nombre.charAt(0).toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td>{u.nombre}</td>
                                                                <td style={{fontSize: '0.85em'}}>{u.email}</td>
                                                                <td>
                                                                    <span className={`badge ${u.rol === 'admin' ? 'bg-danger' : 'bg-primary'}`}>
                                                                        {u.rol}
                                                                    </span>
                                                                </td>
                                                                <td className="text-center">
                                                                    {u.activo ? '✅' : '❌'}
                                                                </td>
                                                                <td className="text-center">
                                                                    {u.activo_torneo_nacional ? '✅' : '❌'}
                                                                </td>
                                                                <td className="text-center">
                                                                    {u.activo_libertadores ? '✅' : '❌'}
                                                                </td>
                                                                <td className="text-center">
                                                                    {u.activo_sudamericana ? '✅' : '❌'}
                                                                </td>
                                                                <td className="text-center">
                                                                    {u.activo_copa_mundo ? '✅' : '❌'}
                                                                </td>
                                                                <td>
                                                                    <button 
                                                                        className="btn btn-sm btn-warning me-1"
                                                                        onClick={() => setUsuarioEditando({...u})}
                                                                        disabled={modoEdicionMasiva}
                                                                    >
                                                                        ✏️
                                                                    </button>
                                                                    <button 
                                                                        className="btn btn-sm btn-danger"
                                                                        onClick={() => handleEliminarUsuario(u.id, u.nombre)}
                                                                        disabled={u.id === usuario.id || modoEdicionMasiva}
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        )
                                                    ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Botón cambiar contraseña */}
                    <button
                        className="btn btn-warning mt-4"
                        onClick={() => navigate("/cambiar-password")}
                    >
                        Cambiar Contraseña
                    </button>
                </>
            )}

            {/* Si no hay usuario logueado, mostrar opciones de registro/login */}
            {!usuario && (
                <div className="mt-4">
                    <p>Para participar, debes estar registrado.</p>
                    <div className="d-flex justify-content-center gap-3">
                        <button className="btn btn-primary" onClick={() => navigate("/register")}>
                            Registrarse
                        </button>
                        <button className="btn btn-outline-primary" onClick={() => navigate("/login")}>
                            Iniciar sesión
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
