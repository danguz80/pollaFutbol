import AppRouter from "./router";
import "./utils/axiosInterceptor";  // Configurar interceptor de axios globalmente

function App() {
  return <AppRouter />;
}

export default App;
