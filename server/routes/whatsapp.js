import express from 'express';
import { getWhatsAppService } from '../services/whatsappService.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// Obtener estado de conexión de WhatsApp
router.get('/status', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const whatsappService = getWhatsAppService();
    const status = await whatsappService.obtenerEstadoConexion();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo estado WhatsApp' });
  }
});

// Enviar mensaje de prueba
router.post('/test', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numeroJornada } = req.body;
    
    if (!numeroJornada) {
      return res.status(400).json({ error: 'Número de jornada requerido' });
    }
    
    const whatsappService = getWhatsAppService();
    const resultado = await whatsappService.enviarMensajeJornadaCerrada(numeroJornada);
    
    if (resultado) {
      res.json({ mensaje: 'Mensaje de prueba enviado correctamente' });
    } else {
      res.status(500).json({ error: 'Error enviando mensaje de prueba' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error en mensaje de prueba' });
  }
});

export default router;