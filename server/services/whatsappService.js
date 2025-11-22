import fetch from 'node-fetch';
import { pool } from '../db/pool.js';
import nodemailer from 'nodemailer';

class WhatsAppService {
  constructor() {
    // Soporta múltiples proveedores
    this.provider = process.env.WHATSAPP_PROVIDER || 'evolution';
    
    // Evolution API config
    this.evolutionApiUrl = process.env.EVOLUTION_API_URL;
    this.evolutionInstanceId = process.env.EVOLUTION_INSTANCE_ID;
    this.evolutionApiKey = process.env.EVOLUTION_API_KEY;
    this.groupId = process.env.WHATSAPP_GROUP_ID;
    
    // WATI config
    this.watiUrl = process.env.WATI_API_URL;
    this.watiToken = process.env.WATI_ACCESS_TOKEN;
    
    // Webhook config
    this.webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    this.phoneNumber = process.env.WHATSAPP_PHONE_NUMBER;
  }

  async enviarMensajeJornadaCerrada(numeroJornada) {
    try {
      // Obtener todos los pronósticos de la jornada
      const pronosticos = await this.obtenerPronosticosJornada(numeroJornada);
      
      if (pronosticos.length === 0) {
        console.log(`⚠️ No hay pronósticos para la jornada ${numeroJornada}`);
        return { success: false, mensaje: 'No hay pronósticos para esta jornada' };
      }

      // Formatear el mensaje
      const mensaje = this.formatearMensajeJornada(numeroJornada, pronosticos);
      
      // Enviar según el proveedor configurado
      let resultado;
      switch (this.provider) {
        case 'email':
          resultado = await this.enviarViaEmail(mensaje, numeroJornada);
          break;
        case 'wati':
          resultado = await this.enviarViaWati(mensaje, numeroJornada);
          break;
        case 'evolution':
          resultado = await this.enviarViaEvolutionAPI(mensaje, numeroJornada);
          break;
        case 'telegram':
          resultado = await this.enviarViaTelegram(mensaje, numeroJornada);
          break;
        case 'webhook':
          resultado = await this.enviarViaWebhook(mensaje, numeroJornada);
          break;
        default:
          resultado = { success: false, mensaje: 'Proveedor no configurado. Usa WHATSAPP_PROVIDER=email, evolution o webhook' };
          break;
      }
      
      if (resultado.success) {
        console.log(`✅ Mensaje enviado para jornada ${numeroJornada}`);
      } else {
        console.error(`❌ Error enviando mensaje: ${resultado.mensaje}`);
      }
      
      return resultado;
      
    } catch (error) {
      console.error('❌ Error enviando mensaje WhatsApp:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarViaWati(mensaje, numeroJornada) {
    try {
      if (!this.watiUrl || !this.watiToken || !this.phoneNumber) {
        return { 
          success: false, 
          mensaje: 'WATI no configurado. Configura WATI_API_URL, WATI_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER en .env' 
        };
      }

      // WATI API endpoint para enviar mensaje
      const url = `${this.watiUrl}/api/v1/sendSessionMessage/${this.phoneNumber}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.watiToken}`
        },
        body: JSON.stringify({
          messageText: mensaje
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.result) {
        return { success: true, mensaje: 'Mensaje enviado via WATI WhatsApp Business' };
      } else {
        return { success: false, mensaje: `Error WATI: ${data.info || data.message || 'Error desconocido'}` };
      }
      
    } catch (error) {
      console.error('Error en WATI:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarViaEmail(mensaje, numeroJornada) {
    try {
      const emailService = process.env.EMAIL_SERVICE || 'gmail';
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;
      const emailTo = process.env.EMAIL_TO;

      if (!emailUser || !emailPass || !emailTo) {
        return { 
          success: false, 
          mensaje: 'Email no configurado. Configura EMAIL_USER, EMAIL_PASS y EMAIL_TO en .env' 
        };
      }

      // Configurar transporter según el servicio
      let transporter;
      if (emailService === 'gmail') {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailUser,
            pass: emailPass // App Password de Gmail
          },
          connectionTimeout: 30000, // 30 segundos
          greetingTimeout: 30000,
          socketTimeout: 30000
        });
      } else {
        // SMTP genérico
        transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT || '587'),
          secure: false,
          auth: {
            user: emailUser,
            pass: emailPass
          },
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 30000
        });
      }

      // Verificar conexión primero
      console.log('🔄 Verificando conexión SMTP...');
      await transporter.verify();
      console.log('✅ Conexión SMTP verificada');

      // Enviar email
      console.log(`📧 Enviando email a ${emailTo}...`);
      const info = await transporter.sendMail({
        from: `"Polla Fútbol" <${emailUser}>`,
        to: emailTo,
        subject: `🏆 Jornada ${numeroJornada} Cerrada - Pronósticos Registrados`,
        text: mensaje,
        html: `<pre style="font-family: monospace; white-space: pre-wrap;">${mensaje}</pre>`
      });

      console.log('✅ Email enviado:', info.messageId);
      return { success: true, mensaje: `Email enviado correctamente a ${emailTo}` };
      
    } catch (error) {
      console.error('Error enviando email:', error);
      return { success: false, mensaje: `Error al enviar email: ${error.message}` };
    }
  }

  async enviarViaEvolutionAPI(mensaje, numeroJornada) {
    try {
      if (!this.evolutionApiUrl || !this.evolutionInstanceId || !this.evolutionApiKey || !this.groupId) {
        return { 
          success: false, 
          mensaje: 'Evolution API no configurado. Necesitas: EVOLUTION_API_URL, EVOLUTION_INSTANCE_ID, EVOLUTION_API_KEY, WHATSAPP_GROUP_ID' 
        };
      }

      const url = `${this.evolutionApiUrl}/message/sendText/${this.evolutionInstanceId}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify({
          number: this.groupId,
          text: mensaje
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, mensaje: 'Mensaje enviado via Evolution API' };
      } else {
        return { success: false, mensaje: `Error Evolution API: ${JSON.stringify(data)}` };
      }
      
    } catch (error) {
      console.error('Error en Evolution API:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarViaWati(mensaje, numeroJornada) {
    try {
      if (!this.watiUrl || !this.watiToken) {
        return { 
          success: false, 
          mensaje: 'WATI no configurado. Configura WATI_API_URL y WATI_ACCESS_TOKEN en .env' 
        };
      }

      // WATI API endpoint para enviar mensaje
      const url = `${this.watiUrl}/api/v1/sendSessionMessage/${this.phoneNumber}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.watiToken}`
        },
        body: JSON.stringify({
          messageText: mensaje
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.result) {
        return { success: true, mensaje: 'Mensaje enviado via WATI WhatsApp' };
      } else {
        return { success: false, mensaje: `Error WATI: ${data.message || 'Error desconocido'}` };
      }
      
    } catch (error) {
      console.error('Error en WATI:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarViaTelegram(mensaje, numeroJornada) {
    try {
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!telegramToken || !chatId) {
        return { 
          success: false, 
          mensaje: 'Telegram no configurado. Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env' 
        };
      }

      const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: mensaje,
          parse_mode: 'HTML'
        })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        return { success: true, mensaje: 'Mensaje enviado via Telegram' };
      } else {
        return { success: false, mensaje: `Error Telegram: ${data.description}` };
      }
      
    } catch (error) {
      console.error('Error en Telegram:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarMensajeSimple(mensaje) {
    try {
      if (!this.webhookUrl) {
        return { 
          success: false, 
          mensaje: 'Webhook URL no configurado. Configura WHATSAPP_WEBHOOK_URL en .env (puedes usar n8n, Make, Zapier o tu propio webhook)' 
        };
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mensaje: mensaje,
          telefono: this.phoneNumber,
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        return { success: true, mensaje: 'Mensaje enviado correctamente' };
      } else {
        const errorText = await response.text();
        return { success: false, mensaje: `Error de API: ${errorText}` };
      }
      
    } catch (error) {
      console.error('Error en envío de mensaje:', error);
      return { success: false, mensaje: error.message };
    }
  }

  async enviarViaWebhook(mensaje, numeroJornada) {
    try {
      if (!this.webhookUrl) {
        return { 
          success: false, 
          mensaje: 'Webhook URL no configurado' 
        };
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({
          jornada: numeroJornada,
          mensaje: mensaje,
          telefono: this.phoneNumber,
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        return { success: true, mensaje: 'Mensaje enviado via webhook' };
      } else {
        const errorText = await response.text();
        return { success: false, mensaje: `Error: ${errorText}` };
      }
      
    } catch (error) {
      console.error('Error en webhook:', error);
      return { success: false, mensaje: error.message };
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
      mensaje += `👤 ${usuario}:\n`;
      
      pronosticosPorUsuario[usuario].forEach(p => {
        const pronostico = `${p.goles_local}-${p.goles_visita}`;
        mensaje += `  ${p.nombre_local} vs ${p.nombre_visita}: ${pronostico}\n`;
      });
      
      mensaje += `\n`;
    });

    mensaje += `⚽ Los partidos están por comenzar...\n`;
    mensaje += `📊 Resultados y puntajes se publicarán al finalizar\n\n`;
    mensaje += `🏅 Campeonato Polla Fútbol`;
    
    return mensaje;
  }

  async obtenerEstadoConexion() {
    let configurado = false;
    let mensaje = '';

    switch (this.provider) {
      case 'evolution':
        configurado = !!(this.evolutionApiUrl && this.evolutionInstanceId && this.evolutionApiKey && this.groupId);
        mensaje = configurado 
          ? 'Evolution API configurado correctamente' 
          : 'Falta configurar EVOLUTION_API_URL, EVOLUTION_INSTANCE_ID, EVOLUTION_API_KEY y WHATSAPP_GROUP_ID';
        break;
      case 'telegram':
        configurado = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
        mensaje = configurado 
          ? 'Telegram configurado correctamente' 
          : 'Falta configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID';
        break;
      case 'webhook':
        configurado = !!this.webhookUrl;
        mensaje = configurado 
          ? 'Webhook configurado correctamente' 
          : 'Falta configurar WHATSAPP_WEBHOOK_URL';
        break;
      default:
        configurado = false;
        mensaje = 'Sin servicio de mensajería configurado. Usa WHATSAPP_PROVIDER=evolution';
    }

    return {
      isReady: configurado,
      isConnected: configurado ? 'READY' : 'NOT_CONFIGURED',
      provider: this.provider,
      mensaje
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