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
import JornadaLibertadores from "./pages/JornadaLibertadores";
import EstadisticasLibertadores from "./pages/EstadisticasLibertadores";
import ClasificacionLibertadores from "./pages/ClasificacionLibertadores";
import PuntuacionLibertadores from "./pages/PuntuacionLibertadores";
import GanadoresJornadaLibertadores from "./pages/GanadoresJornadaLibertadores";
import RankingsHistoricos from "./pages/RankingsHistoricos";
import AdminTorneoNacional from "./pages/Admin/AdminTorneoNacional";
import FixtureTorneoNacional from "./pages/Admin/FixtureTorneoNacional";
import AdminTorneoResultados from "./pages/Admin/AdminTorneoResultados";
import EstadisticasNacional from "./pages/EstadisticasNacional";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <NavigationBar />
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

        <Route path="/campeonato" element={<Campeonato />} />
        <Route path="/estadisticas-nacional" element={<EstadisticasNacional />} />
        <Route path="/libertadores" element={<Libertadores />} />
        <Route path="/libertadores/jornada/:numero" element={<JornadaLibertadores />} />
        <Route path="/libertadores/estadisticas" element={<EstadisticasLibertadores />} />
        <Route path="/libertadores/clasificacion" element={<ClasificacionLibertadores />} />
        <Route path="/libertadores/puntuacion" element={<PuntuacionLibertadores />} />
        <Route path="/libertadores/ganadores-jornada" element={<GanadoresJornadaLibertadores />} />
        <Route path="/rankings-historicos" element={<RankingsHistoricos />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />
        <Route path="*" element={<h1 className="text-center mt-4">404 - Página no encontrada</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

