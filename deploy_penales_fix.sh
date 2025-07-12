#!/bin/bash

# Script de despliegue para corrección de penales Sudamericana
# Usar con precaución en producción

set -e  # Salir si cualquier comando falla

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración (MODIFICAR SEGÚN TU ENTORNO)
DB_HOST="localhost"
DB_USER="tu_usuario"
DB_NAME="tu_base_datos"
CLIENT_DIR="./client"
SERVER_DIR="./server"
BACKUP_DIR="./backups"

echo -e "${YELLOW}=== DESPLIEGUE CORRECCIÓN PENALES SUDAMERICANA ===${NC}"
echo

# Función para hacer backup
backup_database() {
    echo -e "${YELLOW}1. Creando backup de la base de datos...${NC}"
    
    # Crear directorio de backups si no existe
    mkdir -p "$BACKUP_DIR"
    
    # Crear backup con timestamp
    BACKUP_FILE="$BACKUP_DIR/backup_sudamericana_$(date +%Y%m%d_%H%M%S).sql"
    
    echo "Creando backup en: $BACKUP_FILE"
    pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Backup creado exitosamente${NC}"
        echo "Archivo: $BACKUP_FILE"
    else
        echo -e "${RED}✗ Error creando backup${NC}"
        exit 1
    fi
    echo
}

# Función para verificar estado actual
verify_current_state() {
    echo -e "${YELLOW}2. Verificando estado actual de penales...${NC}"
    
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT 'Registros con penales encontrados:' as info, COUNT(*) as cantidad
        FROM pronosticos_sudamericana 
        WHERE (penales_local IS NOT NULL OR penales_visita IS NOT NULL);
    "
    echo
}

# Función para limpiar penales
clean_penales() {
    echo -e "${YELLOW}3. Limpiando penales duplicados...${NC}"
    
    read -p "¿Proceder con la limpieza de penales? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operación cancelada por el usuario"
        exit 1
    fi
    
    # Ejecutar script de limpieza
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "limpiar_penales_produccion.sql"
    
    echo -e "${GREEN}✓ Limpieza de penales completada${NC}"
    echo
}

# Función para construir frontend
build_frontend() {
    echo -e "${YELLOW}4. Construyendo frontend...${NC}"
    
    cd "$CLIENT_DIR"
    
    echo "Instalando dependencias..."
    npm install
    
    echo "Construyendo para producción..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend construido exitosamente${NC}"
    else
        echo -e "${RED}✗ Error construyendo frontend${NC}"
        exit 1
    fi
    
    cd ..
    echo
}

# Función para reiniciar backend
restart_backend() {
    echo -e "${YELLOW}5. Reiniciando backend...${NC}"
    
    cd "$SERVER_DIR"
    
    # Instalar dependencias si es necesario
    echo "Verificando dependencias..."
    npm install
    
    # Reiniciar con PM2 (ajustar según tu configuración)
    if command -v pm2 &> /dev/null; then
        echo "Reiniciando con PM2..."
        pm2 restart all
        echo -e "${GREEN}✓ Backend reiniciado con PM2${NC}"
    else
        echo -e "${YELLOW}⚠ PM2 no encontrado. Reinicia manualmente el servidor.${NC}"
    fi
    
    cd ..
    echo
}

# Función para verificar post-despliegue
verify_deployment() {
    echo -e "${YELLOW}6. Verificando despliegue...${NC}"
    
    echo "Ejecutando verificaciones de base de datos..."
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "verificacion_post_despliegue.sql"
    
    echo -e "${GREEN}✓ Verificación completada${NC}"
    echo
}

# Función para mostrar instrucciones finales
show_final_instructions() {
    echo -e "${GREEN}=== DESPLIEGUE COMPLETADO ===${NC}"
    echo
    echo -e "${YELLOW}Próximos pasos:${NC}"
    echo "1. Verificar que la aplicación frontend carga correctamente"
    echo "2. Probar ingreso de pronósticos en un partido de vuelta"
    echo "3. Verificar que los penales se guardan solo en partidos de vuelta"
    echo "4. Comprobar que el avance de cruces funciona correctamente"
    echo "5. Monitorear logs del servidor por errores"
    echo
    echo -e "${YELLOW}En caso de problemas:${NC}"
    echo "- Revisar logs del servidor backend"
    echo "- Consultar consola del navegador"
    echo "- Ejecutar rollback con el backup creado en: $BACKUP_DIR"
    echo
}

# Función principal
main() {
    echo -e "${RED}⚠ IMPORTANTE: Este script realizará cambios en la base de datos${NC}"
    echo -e "${RED}Asegúrate de estar en el entorno correcto antes de continuar${NC}"
    echo
    
    read -p "¿Continuar con el despliegue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Despliegue cancelado por el usuario"
        exit 1
    fi
    
    backup_database
    verify_current_state
    clean_penales
    build_frontend
    restart_backend
    verify_deployment
    show_final_instructions
}

# Ejecutar si es llamado directamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
