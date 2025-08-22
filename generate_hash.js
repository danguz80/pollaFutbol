// Script para generar hash de contraseña usando bcrypt
const bcrypt = require('bcrypt');
const saltRounds = 10;
const plainTextPassword = 'CampeonatoItau2025';

// Generar hash
bcrypt.hash(plainTextPassword, saltRounds, function(err, hash) {
  if (err) {
    console.error('Error generando hash:', err);
    return;
  }
  
  console.log('Hash generado:', hash);
  console.log('SQL para actualizar usuario:');
  console.log(`UPDATE public.usuarios SET password = '${hash}' WHERE id = 16;`);
});
