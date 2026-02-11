import { pool } from './pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function crearTablasMundial() {
  try {
    console.log('📋 Leyendo archivo SQL...');
    const sqlFile = path.join(__dirname, 'crear_tablas_mundial.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('🔄 Ejecutando SQL en la base de datos...');
    await pool.query(sql);

    console.log('✅ Tablas del Mundial 2026 creadas exitosamente!');
    console.log('📊 Tablas creadas:');
    console.log('   - mundial_equipos');
    console.log('   - mundial_jornadas');
    console.log('   - mundial_partidos');
    console.log('   - mundial_pronosticos');
    console.log('   - mundial_pronosticos_final_virtual');
    console.log('   - mundial_puntos_clasificacion');
    console.log('   - mundial_predicciones_campeon');
    console.log('   - mundial_ganadores_jornada');
    console.log('   - mundial_ganadores_acumulado');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando SQL:', error);
    process.exit(1);
  }
}

crearTablasMundial();
