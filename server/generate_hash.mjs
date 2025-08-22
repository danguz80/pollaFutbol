// Script para generar hash usando la misma configuración que tu app
import bcrypt from 'bcrypt';

const password = 'cslater';

async function generateHash() {
  try {
    // Usar el mismo método que tu aplicación
    const hash = await bcrypt.hash(password, 10);
    console.log('Contraseña:', password);
    console.log('Hash generado:', hash);
    console.log('\nSQL para actualizar:');
    console.log(`UPDATE usuarios SET password = '${hash}' WHERE id = 16;`);
  } catch (error) {
    console.error('Error:', error);
  }
}

generateHash();
