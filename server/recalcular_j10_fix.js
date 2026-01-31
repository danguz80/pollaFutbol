import axios from 'axios';

async function recalcular() {
  try {
    console.log('📊 Recalculando J10...');
    const response = await axios.post('http://localhost:5000/api/sudamericana-puntos/puntos', {
      jornada_numero: 10
    });
    console.log('✅ Respuesta:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

recalcular();
