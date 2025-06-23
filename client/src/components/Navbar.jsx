// components/Navbar.jsx
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Container, Nav, Navbar } from "react-bootstrap";

export default function NavigationBar() {
  const navigate = useNavigate();

  const usuario = JSON.parse(localStorage.getItem("usuario"));
  const rol = usuario?.rol;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    navigate("/login");
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        <Navbar.Brand as={Link} to="/">Campeonato Itaú</Navbar.Brand>
        <Navbar.Toggle aria-controls="main-navbar" />
        <Navbar.Collapse id="main-navbar">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/">Inicio</Nav.Link>
            <Nav.Link as={NavLink} to="/clasificacion">Clasificación</Nav.Link>

            {rol === "jugador" && (
              <>
                <Nav.Link as={NavLink} to="/jornada/1">Ingresar Pronósticos</Nav.Link>
                <Nav.Link as={NavLink} to="/mis-pronosticos">Mis Pronósticos</Nav.Link>
              </>
            )}

            {rol === "admin" && (
              <Nav.Link as={NavLink} to="/admin">Panel Admin</Nav.Link>
            )}

            <Nav.Link as={NavLink} to="/cuadro-final">Cuadro Final</Nav.Link>
            <Nav.Link as={NavLink} to="/ganadores-jornada">Ganadores</Nav.Link>
          </Nav>

          <Nav>
            {usuario ? (
              <>
                <Nav.Link disabled>👤 {usuario.nombre}</Nav.Link>
                <Nav.Link onClick={handleLogout}>Cerrar sesión</Nav.Link>
              </>
            ) : (
              <>
                <Nav.Link as={NavLink} to="/login">Iniciar sesión</Nav.Link>
                <Nav.Link as={NavLink} to="/register">Registrarse</Nav.Link>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
