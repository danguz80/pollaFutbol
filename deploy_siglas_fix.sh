#!/bin/bash

# Colores para salidas en consola
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Iniciando despliegue de fix para siglas de Sudamericana...${NC}"

# Verificar si estamos en el directorio correcto
if [ ! -d "server" ] || [ ! -d "client" ]; then
  echo -e "${RED}Error: Este script debe ejecutarse desde la raíz del proyecto campeonato-itau${NC}"
  exit 1
fi

# Hacer pull de los últimos cambios
echo -e "${YELLOW}Actualizando repositorio...${NC}"
git pull

# Reiniciar el servidor con PM2
echo -e "${YELLOW}Reiniciando el servidor...${NC}"
cd server
pm2 restart index.js

echo -e "${GREEN}¡Fix de siglas en pronósticos de Sudamericana desplegado correctamente!${NC}"
echo -e "${YELLOW}Recordatorio: Los cambios realizados son:${NC}"
echo -e "1. Se implementó la lógica de asignación de siglas del admin en pronosticosSudamericana.js"
echo -e "2. Se agregó la búsqueda directa de siglas en el fixture"
echo -e "3. Se utiliza calcularAvanceSiglas para generar un diccionario global"

exit 0
