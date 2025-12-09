#!/bin/bash
# ==========================================
# Script para eliminar tablas de Copas
# ==========================================

echo "🗑️  ELIMINACIÓN DE TABLAS DE COPAS"
echo "===================================="
echo ""
echo "⚠️  ADVERTENCIA: Este script eliminará permanentemente:"
echo "   - 7 tablas de Sudamericana"
echo "   - 1 tabla de Libertadores"
echo "   - Columna activo_sudamericana de usuarios"
echo ""
read -p "¿Estás seguro de continuar? (escribe 'SI' para confirmar): " confirmacion

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
psql "$DB_URL" -f server/db/eliminar_sudamericana_libertadores.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Script ejecutado exitosamente"
    echo ""
    echo "📊 Tablas restantes:"
    psql "$DB_URL" -c "\dt" | grep public
    echo ""
    echo "✅ PROCESO COMPLETADO"
else
    echo ""
    echo "❌ Error al ejecutar el script"
    exit 1
fi
