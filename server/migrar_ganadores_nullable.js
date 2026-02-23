import { pool } from './db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ejecutarMigracion() {
  try {
    console.log('🔄 Ejecutando migración: hacer columna ganadores nullable...');
    
    const sqlPath = path.join(__dirname, 'db', 'hacer_ganadores_nullable.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Ejecutar la migración
    await pool.query(sql);
    
    console.log('✅ Migración completada exitosamente');
    console.log('✅ La columna ganadores ahora permite valores NULL');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  }
}

ejecutarMigracion();
