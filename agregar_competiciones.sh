#!/bin/bash
# ==========================================
# Script para agregar columnas de competiciones
# ==========================================

echo "🔧 ACTUALIZACIÓN: Agregar Columnas de Competiciones"
echo "===================================================="
echo ""
echo "Este script agregará columnas para gestionar usuarios por competición:"
echo "  🏆 Torneo Nacional"
echo "  🔴 Copa Libertadores"
echo "  🟢 Copa Sudamericana"
echo "  🌍 Copa del Mundo"
echo ""
read -p "¿Continuar? (escribe 'SI' para confirmar): " confirmacion

if [ "$confirmacion" != "SI" ]; then
    echo "❌ Operación cancelada"
    exit 1
fi

echo ""
echo "📦 Ejecutando script SQL..."
echo ""

# URL de conexión a la base de datos
DB_URL="postgresql://campeonatospega_user:B4qbUOcxz2zQ8rQfanQTse5v43k0MYRq@dpg-d1d04uh5pdvs73a6rhd0-a.oregon-postgres.render.com/campeonatospega"

# Ejecutar el script SQL
psql "$DB_URL" -f server/db/agregar_columnas_competiciones.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Columnas agregadas exitosamente"
    echo ""
    echo "📊 Estructura actualizada de la tabla usuarios:"
    psql "$DB_URL" -c "\d usuarios" | grep activo
    echo ""
    echo "✅ PROCESO COMPLETADO"
    echo ""
    echo "Ahora puedes gestionar usuarios por competición desde el Home (rol admin)"
else
    echo ""
    echo "❌ Error al ejecutar el script"
    exit 1
fi
