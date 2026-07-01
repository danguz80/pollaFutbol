#!/bin/bash
# Script para recalcular puntos directamente en BD

echo "🔄 Recalculando puntos de partidos..."

psql "postgresql://campeonatospega_user:B4qbUOcxz2zQ8rQfanQTse5v43k0MYRq@dpg-d1d04uh5pdvs73a6rhd0-a.oregon-postgres.render.com/campeonatospega" << 'EOF'
-- Para cada jornada cerrada, recalcular los puntos correctamente
-- Los puntos de partidos SI llevan bonus
-- Los puntos de clasificación NO llevan bonus

-- Actualizar puntos de partidos con bonus correcto
-- Este es un UPDATE que recalcula basado en la lógica correcta

-- Para J1-J3: 
-- - Resultado exacto: 5 puntos
-- - Diferencia + signo correcto: 3 puntos
-- - Solo signo correcto: 1 punto
-- Todo multiplicado por bonus

-- Para J4+:
-- - Resultado exacto: 5 puntos
-- - Diferencia + signo correcto: 3 puntos
-- - Solo signo correcto: 1 punto
-- + 2 puntos extra si acierta quien avanza en empate
-- Todo multiplicado por bonus

-- Crear tabla temporal con cálculos
CREATE TEMPORARY TABLE puntos_temp AS
SELECT 
  mp.id,
  CASE 
    WHEN mp.resultado_local = p.resultado_local AND mp.resultado_visitante = p.resultado_visitante THEN 5
    WHEN ABS(mp.resultado_local - mp.resultado_visitante) = ABS(p.resultado_local - p.resultado_visitante) 
         AND ((mp.resultado_local > mp.resultado_visitante AND p.resultado_local > p.resultado_visitante)
           OR (mp.resultado_local < mp.resultado_visitante AND p.resultado_local < p.resultado_visitante)
           OR (mp.resultado_local = mp.resultado_visitante AND p.resultado_local = p.resultado_visitante)) THEN 3
    WHEN ((mp.resultado_local > mp.resultado_visitante AND p.resultado_local > p.resultado_visitante)
       OR (mp.resultado_local < mp.resultado_visitante AND p.resultado_local < p.resultado_visitante)
       OR (mp.resultado_local = mp.resultado_visitante AND p.resultado_local = p.resultado_visitante)) THEN 1
    ELSE 0
  END as puntos_base,
  CASE 
    WHEN mj.numero >= 4 AND p.resultado_local = p.resultado_visitante 
         AND mp.resultado_local = mp.resultado_visitante
         AND p.quien_avanzo IS NOT NULL
         AND mp.quien_avanza = p.quien_avanzo THEN 2
    ELSE 0
  END as puntos_extra,
  COALESCE(p.bonus, 1) as bonus
FROM mundial_pronosticos mp
INNER JOIN mundial_partidos p ON mp.partido_id = p.id
INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
WHERE p.resultado_local IS NOT NULL AND p.resultado_visitante IS NOT NULL;

-- Actualizar los puntos en mundial_pronosticos
UPDATE mundial_pronosticos mp
SET puntos = (puntos_base + puntos_extra) * bonus
FROM puntos_temp pt
WHERE mp.id = pt.id;

SELECT 'Puntos de partidos actualizados: ' || COUNT(*) as resultado FROM puntos_temp;

DROP TABLE puntos_temp;
EOF

echo "✅ Puntos de partidos recalculados correctamente"
