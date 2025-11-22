import express from 'express';
import { getWhatsAppService } from '../services/whatsappService.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// Obtener estado de conexión del servicio de notificaciones
router.get('/status', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const whatsappService = getWhatsAppService();
    const status = await whatsappService.obtenerEstadoConexion();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo estado del servicio' });
  }
});

// Enviar notificación por email para una jornada
router.post('/enviar-jornada', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numeroJornada } = req.body;
    
    if (!numeroJornada) {
      return res.status(400).json({ error: 'Número de jornada requerido' });
    }
    
    const whatsappService = getWhatsAppService();
    const resultado = await whatsappService.enviarMensajeJornadaCerrada(numeroJornada);
    
    if (resultado.success) {
      res.json({ 
        success: true, 
        mensaje: `Notificación enviada correctamente para la jornada ${numeroJornada}` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: resultado.mensaje || 'Error enviando notificación' 
      });
    }
  } catch (error) {
    console.error('Error en endpoint enviar-jornada:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

export default router;