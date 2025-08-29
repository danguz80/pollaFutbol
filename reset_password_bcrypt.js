// Script para generar hash de contraseña compatible con el backend
const bcrypt = require('bcrypt');

// Definir la nueva contraseña y usuario ID
const newPassword = 'CampeonatoItau2025';
const userId = 16;

// Generar hash
bcrypt.hash(newPassword, 10, async function(err, hash) {
  if (err) {
    console.error('Error generando hash:', err);
    return;
  }
  
  console.log('Nueva contraseña:', newPassword);
  console.log('Hash generado:', hash);
  console.log('SQL para actualizar usuario:');
  console.log(`UPDATE public.usuarios SET password = '${hash}' WHERE id = ${userId};`);
  
  // Aquí podrías ejecutar directamente la consulta SQL si lo deseas
});
