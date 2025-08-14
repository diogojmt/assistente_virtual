const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
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
      
      // Obter versão mais recente do Baileys
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info(`Versão Baileys: ${version}, Latest: ${isLatest}`);
      
      // Configurar autenticação
      const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
      
      // Criar socket com configurações otimizadas
      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'keys' }))
        },
        printQRInTerminal: false,
        logger: logger.child({ module: 'baileys' }),
        browser: Browsers.macOS('Desktop'),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false
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
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      logger.info(`Conexão fechada. Motivo: ${statusCode}`);
      
      if (statusCode === DisconnectReason.connectionClosed || 
          statusCode === DisconnectReason.connectionLost ||
          statusCode === DisconnectReason.restartRequired) {
        logger.info('Tentando reconectar em 5 segundos...');
        setTimeout(() => this.initialize(), 5000);
      } else if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
        logger.info('Sessão expirada. Delete a pasta baileys_auth e reinicie o bot para gerar novo QR.');
      } else if (shouldReconnect) {
        logger.info('Tentando reconectar em 10 segundos...');
        setTimeout(() => this.initialize(), 10000);
      } else {
        logger.info('Desconectado. Por favor, reinicie o bot.');
      }
    } else if (connection === 'open') {
      logger.info('Bot conectado ao WhatsApp com sucesso!');
    } else if (connection === 'connecting') {
      logger.info('Conectando ao WhatsApp...');
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
