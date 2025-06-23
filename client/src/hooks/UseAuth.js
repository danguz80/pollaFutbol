import { useEffect, useState } from "react";

export default function useAuth() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const data = localStorage.getItem("usuario");
    if (data) {
      try {
        setUsuario(JSON.parse(data));
      } catch {
        setUsuario(null);
      }
    }
  }, []);

  return usuario;
}
