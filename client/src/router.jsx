import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Clasificacion from "./pages/Clasificacion";
import Jornada from "./pages/Jornada";
import CuadroFinal from "./pages/CuadroFinal";
import GanadoresJornada from "./pages/GanadoresJornada";
import AdminPanel from "./pages/Admin/AdminPanel";
import ChileFixtures from "./pages/Admin/ChileFixtures";
import NavigationBar from "./components/Navbar";
import Campeonato from "./pages/Campeonato";
import Register from "./pages/Register";
import Login from "./pages/Login";
import UsuariosPendientes from "./pages/Admin/UsuariosPendientes";
import RutaProtegidaAdmin from "./components/RutaProtegidaAdmin";
import CambiarPassword from "./pages/CambiarPassword";
import AdminLibertadores from "./pages/AdminLibertadores";
import Libertadores from "./pages/Libertadores";
import Sudamericana from "./pages/Sudamericana";
import Mundial from "./pages/Mundial";
import JornadaLibertadores from "./pages/JornadaLibertadores";
import JornadaSudamericana from "./pages/JornadaSudamericana";
import EstadisticasLibertadores from "./pages/EstadisticasLibertadores";
import EstadisticasSudamericana from "./pages/EstadisticasSudamericana";
import ClasificacionLibertadores from "./pages/ClasificacionLibertadores";
import ClasificacionSudamericana from "./pages/ClasificacionSudamericana";
import PuntuacionLibertadores from "./pages/PuntuacionLibertadores";
import PuntuacionSudamericana from "./pages/PuntuacionSudamericana";
import GanadoresJornadaLibertadores from "./pages/GanadoresJornadaLibertadores";
import GanadoresJornadaSudamericana from "./pages/GanadoresJornadaSudamericana";
import RankingsHistoricos from "./pages/RankingsHistoricos";
import AdminTorneoNacional from "./pages/Admin/AdminTorneoNacional";
import FixtureTorneoNacional from "./pages/Admin/FixtureTorneoNacional";
import AdminTorneoResultados from "./pages/Admin/AdminTorneoResultados";
import AdminCuadroFinal from "./pages/Admin/AdminCuadroFinal";
import AdminLibertadoresGestion from "./pages/Admin/AdminLibertadoresGestion";
import AdminLibertadoresResultados from "./pages/Admin/AdminLibertadoresResultados";
import AdminSudamericana from "./pages/AdminSudamericana";
import AdminSudamericanaGestion from "./pages/Admin/AdminSudamericanaGestion";
import AdminSudamericanaResultados from "./pages/Admin/AdminSudamericanaResultados";
import AdminMundial from "./pages/Admin/AdminMundial";
import AdminMundialFixture from "./pages/Admin/AdminMundialFixture";
import AdminMundialResultados from "./pages/Admin/AdminMundialResultados";
import AdminMundialGestion from "./pages/Admin/AdminMundialGestion";
import JornadaMundial from "./pages/JornadaMundial";
import EstadisticasNacional from "./pages/EstadisticasNacional";
import ModalNotificacionGanador from "./components/ModalNotificacionGanador";
import { useNotificaciones } from "./hooks/useNotificaciones";
import TodasNotificaciones from "./pages/TodasNotificaciones";
import SimuladorResultados from "./pages/SimuladorResultados";

export default function AppRouter() {
  const { notificacionActual, mostrandoModal, cerrarNotificacion } = useNotificaciones();

  return (
    <BrowserRouter>
      <NavigationBar />
      
      {/* Modal de notificaciones de ganadores */}
      <ModalNotificacionGanador 
        notificacion={notificacionActual}
        show={mostrandoModal}
        onClose={cerrarNotificacion}
      />
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clasificacion" element={<Clasificacion />} />
        <Route path="/jornada/:id" element={<Jornada />} />
        <Route path="/cuadro-final" element={<CuadroFinal />} />
        <Route path="/ganadores-jornada" element={<GanadoresJornada />} />

        <Route path="/admin" element={
          <RutaProtegidaAdmin>
            <AdminPanel />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/chile-fixtures" element={
          <RutaProtegidaAdmin>
            <ChileFixtures />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/usuarios" element={
          <RutaProtegidaAdmin>
            <UsuariosPendientes />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/libertadores" element={
          <RutaProtegidaAdmin>
            <AdminLibertadores />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/libertadores/fixture" element={
          <RutaProtegidaAdmin>
            <AdminLibertadores />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/libertadores/gestion" element={
          <RutaProtegidaAdmin>
            <AdminLibertadoresGestion />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/libertadores/resultados" element={
          <RutaProtegidaAdmin>
            <AdminLibertadoresResultados />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/sudamericana" element={
          <RutaProtegidaAdmin>
            <AdminSudamericana />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/sudamericana/fixture" element={
          <RutaProtegidaAdmin>
            <AdminSudamericana />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/sudamericana/gestion" element={
          <RutaProtegidaAdmin>
            <AdminSudamericanaGestion />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/sudamericana/resultados" element={
          <RutaProtegidaAdmin>
            <AdminSudamericanaResultados />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/mundial" element={
          <RutaProtegidaAdmin>
            <AdminMundialFixture />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/mundial/fixture" element={
          <RutaProtegidaAdmin>
            <AdminMundialFixture />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/mundial/resultados" element={
          <RutaProtegidaAdmin>
            <AdminMundialResultados />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/mundial/gestion" element={
          <RutaProtegidaAdmin>
            <AdminMundialGestion />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/torneo-nacional" element={
          <RutaProtegidaAdmin>
            <AdminTorneoNacional />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/torneo-nacional/fixture" element={
          <RutaProtegidaAdmin>
            <FixtureTorneoNacional />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/torneo-nacional/resultados" element={
          <RutaProtegidaAdmin>
            <AdminTorneoResultados />
          </RutaProtegidaAdmin>
        } />
        <Route path="/admin/torneo-nacional/cuadro-final" element={
          <RutaProtegidaAdmin>
            <AdminCuadroFinal />
          </RutaProtegidaAdmin>
        } />

        <Route path="/campeonato" element={<Campeonato />} />
        <Route path="/estadisticas-nacional" element={<EstadisticasNacional />} />
        <Route path="/simulador-resultados" element={<SimuladorResultados />} />
        <Route path="/libertadores" element={<Libertadores />} />
        <Route path="/libertadores/jornada/:numero" element={<JornadaLibertadores />} />
        <Route path="/libertadores/estadisticas" element={<EstadisticasLibertadores />} />
        <Route path="/libertadores/clasificacion" element={<ClasificacionLibertadores />} />
        <Route path="/libertadores/puntuacion" element={<PuntuacionLibertadores />} />
        <Route path="/libertadores/ganadores-jornada" element={<GanadoresJornadaLibertadores />} />
        <Route path="/sudamericana" element={<Sudamericana />} />
        <Route path="/sudamericana/jornada/:numero" element={<JornadaSudamericana />} />
        <Route path="/sudamericana/estadisticas" element={<EstadisticasSudamericana />} />
        <Route path="/sudamericana/clasificacion" element={<ClasificacionSudamericana />} />
        <Route path="/sudamericana/puntuacion" element={<PuntuacionSudamericana />} />
        <Route path="/sudamericana/ganadores-jornada" element={<GanadoresJornadaSudamericana />} />
        <Route path="/sudamericana/clasificacion" element={<ClasificacionSudamericana />} />
        <Route path="/sudamericana/puntuacion" element={<PuntuacionSudamericana />} />
        <Route path="/mundial" element={<Mundial />} />
        <Route path="/mundial/jornada/:numero" element={<JornadaMundial />} />
        <Route path="/rankings-historicos" element={<RankingsHistoricos />} />
        <Route path="/notificaciones" element={<TodasNotificaciones />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />
        <Route path="*" element={<h1 className="text-center mt-4">404 - Página no encontrada</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

