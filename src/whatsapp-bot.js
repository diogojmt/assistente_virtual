const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  Browsers
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const OpenAIService = require('./openai-service');

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.openaiService = new OpenAIService();
  }

  async initialize() {
    try {
      logger.info('Inicializando bot do WhatsApp...');
      
      // Configurar autenticação
      const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
      
      // Criar socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: 'baileys' }),
        browser: Browsers.macOS('Desktop'),
        defaultQueryTimeoutMs: 60000
      });

      // Event listeners
      this.setupEventListeners(saveCreds);
      
      logger.info('Bot inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar bot:', error.message);
      throw error;
    }
  }

  setupEventListeners(saveCreds) {
    // Conexão
    this.sock.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update);
    });

    // Credenciais
    this.sock.ev.on('creds.update', saveCreds);

    // Mensagens
    this.sock.ev.on('messages.upsert', async (messageUpdate) => {
      await this.handleIncomingMessages(messageUpdate);
    });
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      logger.info('QR Code gerado. Escaneie com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.info(`Conexão fechada. Motivo: ${lastDisconnect?.error?.output?.statusCode}`);
      
      if (shouldReconnect) {
        logger.info('Tentando reconectar...');
        setTimeout(() => this.initialize(), 5000);
      } else {
        logger.info('Desconectado. Por favor, reinicie o bot.');
      }
    } else if (connection === 'open') {
      logger.info('Bot conectado ao WhatsApp com sucesso!');
    }
  }

  async handleIncomingMessages(messageUpdate) {
    try {
      const messages = messageUpdate.messages;
      
      if (!messages || messages.length === 0) return;
      
      for (const message of messages) {
        await this.processMessage(message);
      }
    } catch (error) {
      logger.error('Erro ao processar mensagens:', error.message);
    }
  }

  async processMessage(message) {
    try {
      // Ignorar mensagens do próprio bot
      if (message.key.fromMe) return;
      
      // Verificar se é mensagem de texto
      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text;
      
      if (!messageText) return;
      
      const fromNumber = message.key.remoteJid;
      const senderName = message.pushName || 'Usuário';
      
      logger.info(`Mensagem recebida de ${senderName} (${fromNumber}): "${messageText}"`);
      
      // Enviar indicador de "digitando"
      await this.sock.sendPresenceUpdate('composing', fromNumber);
      
      try {
        // Processar com OpenAI
        const response = await this.openaiService.processMessage(messageText);
        
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar resposta
        await this.sendMessage(fromNumber, response);
        
        logger.info(`Resposta enviada para ${senderName}: "${response.substring(0, 100)}..."`);
        
      } catch (error) {
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar mensagem de erro
        const errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
        await this.sendMessage(fromNumber, errorMessage);
        
        logger.error(`Erro ao processar mensagem de ${senderName}:`, error.message);
        logger.error('Stack:', error.stack);
      }
      
    } catch (error) {
      logger.error('Erro geral no processamento da mensagem:', error.message);
      logger.error('Stack:', error.stack);
    }
  }

  async sendMessage(to, text) {
    try {
      await this.sock.sendMessage(to, { text });
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error.message);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();
    } catch (error) {
      logger.error('Falha ao iniciar bot:', error.message);
      process.exit(1);
    }
  }
}

module.exports = WhatsAppBot;
