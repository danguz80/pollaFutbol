import { pool } from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createSchema() {
  try {
    console.log('📋 Leyendo archivo de schema...');
    const schemaPath = path.join(__dirname, '../sql/sudamericana_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🔌 Conectando a la base de datos...');
    const client = await pool.connect();
    
    try {
      console.log('⚡ Ejecutando schema de Copa Sudamericana...');
      await client.query(schema);
      console.log('✅ Schema de Copa Sudamericana creado exitosamente!');
      
      // Verificar tablas creadas
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'sudamericana_%'
        ORDER BY table_name
      `);
      
      console.log('\n📊 Tablas creadas:');
      result.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}`);
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error al crear schema:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createSchema();
