// Utilidades de estilo para ranking Sudamericana (idéntico a Ranking Acumulado Nacional)
export function getSudamericanaCellStyle(i) {
  if (i === 0) return { background: "#ffbe56", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
  if (i === 1) return { background: "#396366", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
  if (i === 2) return { background: "#44777b", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
  return { textAlign: "center" };
}
