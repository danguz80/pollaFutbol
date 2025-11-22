import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { pool } from '../db/pool.js';

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.initialize();
  }

  initialize() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.client.on('qr', (qr) => {
      console.log('📱 Escanea este código QR con WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('QR Code generado - Escanea con WhatsApp Web');
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp Client está listo!');
      this.isReady = true;
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp autenticado correctamente');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Fallo en autenticación WhatsApp:', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp desconectado:', reason);
      this.isReady = false;
    });

    this.client.initialize();
  }

  async enviarMensajeJornadaCerrada(numeroJornada) {
    if (!this.isReady) {
      console.error('❌ WhatsApp no está listo');
      return false;
    }

    try {
      // Obtener todos los pronósticos de la jornada
      const pronosticos = await this.obtenerPronosticosJornada(numeroJornada);
      
      if (pronosticos.length === 0) {
        console.log(`⚠️ No hay pronósticos para la jornada ${numeroJornada}`);
        return false;
      }

      // Formatear el mensaje
      const mensaje = this.formatearMensajeJornada(numeroJornada, pronosticos);
      
      // Obtener números de teléfono de los usuarios (ajusta según tu necesidad)
      const grupoId = process.env.WHATSAPP_GROUP_ID || '120363000000000000@g.us'; // ID del grupo
      
      // Enviar mensaje al grupo
      await this.client.sendMessage(grupoId, mensaje);
      
      console.log(`✅ Mensaje enviado para jornada ${numeroJornada}`);
      return true;
      
    } catch (error) {
      console.error('❌ Error enviando mensaje WhatsApp:', error);
      return false;
    }
  }

  async obtenerPronosticosJornada(numeroJornada) {
    try {
      const result = await pool.query(`
        SELECT 
          u.nombre as usuario,
          pa.nombre_local,
          pa.nombre_visita,
          p.goles_local,
          p.goles_visita
        FROM pronosticos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN partidos pa ON p.partido_id = pa.id
        JOIN jornadas j ON pa.jornada_id = j.id
        WHERE j.numero = $1
        ORDER BY u.nombre, pa.fecha
      `, [numeroJornada]);

      return result.rows;
    } catch (error) {
      console.error('Error obteniendo pronósticos:', error);
      return [];
    }
  }

  formatearMensajeJornada(numeroJornada, pronosticos) {
    let mensaje = `🏆 *JORNADA ${numeroJornada} CERRADA* 🏆\n\n`;
    mensaje += `� *PRONÓSTICOS REGISTRADOS:*\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Agrupar por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach(p => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = [];
      }
      pronosticosPorUsuario[p.usuario].push(p);
    });

    // Formatear por usuario
    Object.keys(pronosticosPorUsuario).forEach(usuario => {
      mensaje += `👤 *${usuario}:*\n`;
      
      pronosticosPorUsuario[usuario].forEach(p => {
        const pronostico = `${p.goles_local}-${p.goles_visita}`;
        mensaje += `  ${p.nombre_local} vs ${p.nombre_visita}: *${pronostico}*\n`;
      });
      
      mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    });

    mensaje += `\n⚽ Los partidos están por comenzar...\n`;
    mensaje += `📊 Resultados y puntajes se publicarán al finalizar\n\n`;
    mensaje += `🏅 Campeonato Polla Fútbol`;
    
    return mensaje;
  }

  async obtenerEstadoConexion() {
    return {
      isReady: this.isReady,
      isConnected: this.client ? await this.client.getState() : 'DISCONNECTED'
    };
  }
}

// Singleton
let whatsappService = null;

export function getWhatsAppService() {
  if (!whatsappService) {
    whatsappService = new WhatsAppService();
  }
  return whatsappService;
}

export default WhatsAppService;