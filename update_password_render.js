// Script para resetear la contraseña de un usuario específico en la base de datos
// Para ejecutar: node update_password_render.js

const { Pool } = require('pg');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

// Conexión a base de datos - usa las variables de entorno que ya están configuradas
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necesario para conexiones a Render
  }
});

// ID del usuario y contraseña hasheada
const userId = 16;
const newPasswordHash = '$2b$10$CgbwJLD3.tCPEwTZOvRhY.4lJ5m2KJg5tZFK7qVIzCM0KFoaoWyka';

async function resetPassword() {
  try {
    console.log(`Intentando actualizar la contraseña para el usuario ID ${userId}...`);
    
    // Ejecutar la consulta
    const result = await pool.query(
      'UPDATE public.usuarios SET password = $1 WHERE id = $2 RETURNING id, nombre, email',
      [newPasswordHash, userId]
    );
    
    if (result.rowCount === 0) {
      console.log(`⚠️ No se encontró ningún usuario con ID ${userId}`);
    } else {
      const user = result.rows[0];
      console.log(`✅ Contraseña actualizada con éxito para:`);
      console.log(`   - Usuario: ${user.nombre}`);
      console.log(`   - Email: ${user.email}`);
      console.log(`   - ID: ${user.id}`);
      console.log(`\nLa nueva contraseña es: "Itau2025" (sin comillas)`);
    }
  } catch (error) {
    console.error('❌ Error al actualizar la contraseña:', error);
  } finally {
    // Cerrar la conexión
    await pool.end();
  }
}

// Ejecutar la función
resetPassword();
