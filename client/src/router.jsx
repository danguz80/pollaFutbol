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
import Libertadores from "./pages/Libertadores";
import Sudamericana from "./pages/Sudamericana";
import Register from "./pages/Register";
import Login from "./pages/Login";
import UsuariosPendientes from "./pages/Admin/UsuariosPendientes";
import RutaProtegidaAdmin from "./components/RutaProtegidaAdmin";
import MisPronosticos from "./pages/MisPronosticos";
import CambiarPassword from "./pages/CambiarPassword";

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

        <Route path="/campeonato" element={<Campeonato />} />
        <Route path="/libertadores" element={<Libertadores />} />
        <Route path="/sudamericana" element={<Sudamericana />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />
        <Route path="/mis-pronosticos" element={<MisPronosticos />} />
        <Route path="*" element={<h1 className="text-center mt-4">404 - Página no encontrada</h1>} />
      </Routes>
    </BrowserRouter>
  );
}

