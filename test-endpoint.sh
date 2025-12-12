#!/bin/bash
# Script para probar el endpoint de rankings históricos

echo "🧪 Probando endpoint de Torneo Nacional 2025..."
echo ""

# Obtener token (necesitas reemplazar con credenciales válidas)
echo "Para probar con autenticación, primero inicia sesión y obtén un token"
echo "Luego ejecuta:"
echo ""
echo "curl -H 'Authorization: Bearer TU_TOKEN' https://pollafutbol.onrender.com/api/rankings-historicos/torneo-nacional-2025"
echo ""

# Probar sin autenticación para ver el error
echo "Probando sin autenticación (debería dar error 401):"
curl -i https://pollafutbol.onrender.com/api/rankings-historicos/torneo-nacional-2025 2>/dev/null | head -20
