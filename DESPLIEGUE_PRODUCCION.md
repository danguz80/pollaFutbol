# Despliegue de Corrección de Penales Sudamericana - Producción

## Resumen de Cambios
Esta actualización corrige el manejo de penales en la Sudamericana para que:
- Los penales solo se guarden en el partido de vuelta (fixture_id más alto del cruce)
- No se dupliquen en ambos partidos de ida y vuelta
- El frontend y backend sean consistentes en el manejo de penales
- El avance de cruces y reemplazo de siglas funcione correctamente en todas las páginas

## 1. ANTES DE EMPEZAR - Backup de Base de Datos

```bash
# Crear backup completo de la base de datos
pg_dump -h localhost -U tu_usuario -d tu_base_datos > backup_sudamericana_$(date +%Y%m%d_%H%M%S).sql

# O si usas Docker:
docker exec tu_contenedor_postgres pg_dump -U tu_usuario tu_base_datos > backup_sudamericana_$(date +%Y%m%d_%H%M%S).sql
```

## 2. VERIFICAR ESTADO ACTUAL DE PENALES

```bash
# Conectar a la base de datos
psql -h localhost -U tu_usuario -d tu_base_datos

# O si usas Docker:
docker exec -it tu_contenedor_postgres psql -U tu_usuario -d tu_base_datos
```

```sql
-- Ejecutar este query para ver el estado actual
SELECT 
    fixture_id, 
    ronda, 
    equipo_local, 
    equipo_visita, 
    penales_local, 
    penales_visita,
    usuario_id
FROM pronosticos_sudamericana 
WHERE (penales_local IS NOT NULL OR penales_visita IS NOT NULL)
ORDER BY equipo_local, equipo_visita, fixture_id;
```

## 3. LIMPIAR PENALES DUPLICADOS

Ejecutar el siguiente script SQL completo en la base de datos:

```sql
-- Script para limpiar penales duplicados en la Sudamericana
-- Solo debe haber penales en el partido de vuelta (fixture_id más alto del cruce)

-- Limpiar penales de partidos de ida (conservar solo en los de vuelta)
WITH cruces_penales AS (
    SELECT 
        equipo_local,
        equipo_visita,
        fixture_id,
        penales_local,
        penales_visita,
        -- Crear una clave del cruce ordenando los equipos
        CASE 
            WHEN equipo_local < equipo_visita 
            THEN equipo_local || ' vs ' || equipo_visita
            ELSE equipo_visita || ' vs ' || equipo_local
        END as cruce_key,
        ROW_NUMBER() OVER (
            PARTITION BY 
                CASE 
                    WHEN equipo_local < equipo_visita 
                    THEN equipo_local || ' vs ' || equipo_visita
                    ELSE equipo_visita || ' vs ' || equipo_local
                END
            ORDER BY fixture_id DESC
        ) as rn
    FROM pronosticos_sudamericana 
    WHERE (penales_local IS NOT NULL OR penales_visita IS NOT NULL)
),
fixtures_a_limpiar AS (
    SELECT fixture_id
    FROM cruces_penales 
    WHERE rn > 1  -- Todos excepto el fixture_id más alto por cruce
)
-- Limpiar penales de los partidos de ida
UPDATE pronosticos_sudamericana 
SET 
    penales_local = NULL,
    penales_visita = NULL
WHERE fixture_id IN (SELECT fixture_id FROM fixtures_a_limpiar);

-- Verificar el resultado
SELECT 
    fixture_id, 
    ronda, 
    equipo_local, 
    equipo_visita, 
    penales_local, 
    penales_visita,
    usuario_id
FROM pronosticos_sudamericana 
WHERE (penales_local IS NOT NULL OR penales_visita IS NOT NULL)
ORDER BY equipo_local, equipo_visita, fixture_id;
```

## 4. DESPLEGAR CÓDIGO FRONTEND

```bash
# En el directorio client/
cd client/

# Instalar dependencias (si es necesario)
npm install

# Construir para producción
npm run build

# Desplegar archivos (ejemplo con rsync o tu método preferido)
# Reemplaza con tu comando de despliegue específico
rsync -avz --delete dist/ usuario@servidor:/ruta/al/frontend/

# O si usas un servicio como Netlify, Vercel, etc.
# Seguir el proceso específico de tu plataforma
```

## 5. DESPLEGAR CÓDIGO BACKEND

```bash
# En el directorio server/
cd server/

# Instalar dependencias (si es necesario)
npm install

# Reiniciar el servidor (ejemplo con PM2)
pm2 restart tu_app_name

# O si usas Docker
docker-compose restart tu_servicio_backend

# O si usas systemd
sudo systemctl restart tu_servicio_backend
```

## 6. VERIFICACIÓN POST-DESPLIEGUE

### 6.1 Verificar Base de Datos
```sql
-- Verificar que solo hay penales en partidos de vuelta
SELECT 
    fixture_id, 
    ronda, 
    equipo_local, 
    equipo_visita, 
    penales_local, 
    penales_visita,
    COUNT(*) OVER (
        PARTITION BY 
            CASE 
                WHEN equipo_local < equipo_visita 
                THEN equipo_local || ' vs ' || equipo_visita
                ELSE equipo_visita || ' vs ' || equipo_local
            END
    ) as penales_en_cruce
FROM pronosticos_sudamericana 
WHERE (penales_local IS NOT NULL OR penales_visita IS NOT NULL)
ORDER BY equipo_local, equipo_visita, fixture_id;

-- El resultado debe mostrar penales_en_cruce = 1 para todos los registros
```

### 6.2 Probar Frontend
1. **Página de Ingreso de Pronósticos:**
   - Verificar que solo se muestran campos de penales en partidos de vuelta
   - Probar guardar penales y verificar que se guardan correctamente
   - Verificar que el avance de cruces muestra correctamente

2. **Página de Mis Pronósticos:**
   - Verificar que los penales se muestran solo en partidos de vuelta
   - Verificar que el avance de cruces es correcto
   - Verificar que se muestran nombres reales en lugar de siglas

3. **Página de Clasificación:**
   - Verificar que el avance de cruces funciona correctamente
   - Verificar que se muestran nombres reales

### 6.3 Verificar Logs del Servidor
```bash
# Revisar logs del servidor para errores
pm2 logs tu_app_name

# O con Docker
docker logs tu_contenedor_backend

# O con systemd
journalctl -u tu_servicio_backend -f
```

## 7. ROLLBACK (Si es necesario)

Si algo sale mal, puedes hacer rollback:

### 7.1 Rollback de Base de Datos
```bash
# Restaurar desde backup
psql -h localhost -U tu_usuario -d tu_base_datos < backup_sudamericana_YYYYMMDD_HHMMSS.sql

# O con Docker
docker exec -i tu_contenedor_postgres psql -U tu_usuario tu_base_datos < backup_sudamericana_YYYYMMDD_HHMMSS.sql
```

### 7.2 Rollback de Código
```bash
# Revertir al commit anterior en Git
git revert HEAD

# O hacer checkout a un commit específico
git checkout commit_anterior

# Reconstruir y redesplegar
```

## 8. MONITOREO POST-DESPLIEGUE

- Monitorear logs de errores durante las primeras horas
- Verificar que los usuarios pueden guardar pronósticos correctamente
- Revisar que no hay errores 500 en el backend
- Confirmar que la UI muestra la información correctamente

## Archivos Principales Modificados

### Frontend:
- `client/src/pages/IngresarPronosticosSud.jsx`
- `client/src/pages/MisPronosticosSud.jsx`
- `client/src/pages/ClasificacionSudamericana.jsx`
- `client/src/utils/sudamericanaEliminatoria.js`

### Backend:
- `server/routes/pronosticosSudamericana.js`
- `server/utils/sudamericanaSiglas.js`

### Scripts SQL:
- `limpiar_penales_duplicados.sql`
- `verificar_penales_bd.sql`

## Contacto de Soporte

En caso de problemas durante el despliegue, revisar:
1. Logs del servidor backend
2. Consola del navegador para errores frontend
3. Estado de la base de datos con los scripts de verificación
4. Conectividad entre frontend y backend

---

**IMPORTANTE:** Ejecutar este despliegue durante un período de bajo tráfico y tener el backup de la base de datos listo antes de comenzar.
