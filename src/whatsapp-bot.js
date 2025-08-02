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
      logger.info('='.repeat(60));
      logger.info('QR CODE PARA WHATSAPP - Escaneie com seu celular:');
      logger.info('Se o QR estiver muito grande, diminua o zoom do terminal');
      logger.info('Ou copie este link e abra no navegador para ver o QR:');
      logger.info(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
      logger.info('='.repeat(60));
      qrcode.generate(qr, { small: true });
      logger.info('='.repeat(60));
      logger.info('Aguardando conexão...');
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
      
      // Ignorar mensagens de status
      if (message.key.remoteJid === 'status@broadcast') return;
      
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
        // Processar SEMPRE com OpenAI Assistant (principal) - mantendo contexto por usuário
        const response = await this.openaiService.processMessage(messageText, fromNumber);
        
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar resposta
        await this.sendMessage(fromNumber, response);
        
        logger.info(`Resposta enviada para ${senderName}: "${response.substring(0, 100)}..."`);
        
      } catch (error) {
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar mensagem de erro genérica
        const errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
        await this.sendMessage(fromNumber, errorMessage);
        
        logger.error(`Erro ao processar mensagem de ${senderName}:`, error.message);
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
