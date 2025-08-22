// Script para generar hash bcrypt para la contraseña "cslater"
const bcrypt = require('bcrypt');

const password = 'cslater';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
  if (err) {
    console.error('Error generando hash:', err);
  } else {
    console.log('Contraseña:', password);
    console.log('Hash bcrypt:', hash);
    console.log('\nSQL para actualizar:');
    console.log(`UPDATE usuarios SET password = '${hash}' WHERE id = 16;`);
  }
});
