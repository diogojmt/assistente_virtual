const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  Browsers
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const OpenAIService = require('./openai-service');
const { consultarPertences, validarCpfCnpj, formatarDocumento } = require('./consultaPertences');
const { processarMensagem, limparEstadoUsuario } = require('./conversationManager');

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
        // Processar com o gerenciador de conversação
        const response = await processarMensagem(fromNumber, messageText);
        
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar resposta
        await this.sendMessage(fromNumber, response);
        
        logger.info(`Resposta enviada para ${senderName}: "${response.substring(0, 100)}..."`);
        
      } catch (error) {
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Fallback para OpenAI em caso de erro no gerenciador
        try {
          const response = await this.openaiService.processMessage(messageText);
          await this.sendMessage(fromNumber, response);
          logger.info(`Resposta OpenAI enviada para ${senderName}: "${response.substring(0, 100)}..."`);
        } catch (openaiError) {
          // Enviar mensagem de erro genérica
          const errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
          await this.sendMessage(fromNumber, errorMessage);
          logger.error(`Erro OpenAI para ${senderName}:`, openaiError.message);
        }
        
        logger.error(`Erro no gerenciador de conversação para ${senderName}:`, error.message);
      }
      
    } catch (error) {
      logger.error('Erro geral no processamento da mensagem:', error.message);
      logger.error('Stack:', error.stack);
    }
  }

  async handleConsultaPertences(fromNumber, senderName, documento) {
    try {
      // Enviar mensagem de feedback
      await this.sendMessage(fromNumber, '🔍 Aguarde um momento, estou consultando seus vínculos...');
      
      // Enviar indicador de "digitando"
      await this.sock.sendPresenceUpdate('composing', fromNumber);
      
      logger.info(`Iniciando consulta de pertences para ${senderName} - Documento: ${formatarDocumento(documento)}`);
      
      // Fazer a consulta
      const resultado = await consultarPertences(documento);
      
      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      
      if (resultado.sucesso) {
        const mensagem = `✅ **Consulta de Vínculos**\n\n` +
                        `📄 **Documento:** ${formatarDocumento(documento)}\n\n` +
                        `${resultado.dados}`;
        
        await this.sendMessage(fromNumber, mensagem);
        logger.info(`Consulta de pertences realizada com sucesso para ${senderName}`);
      } else {
        const mensagem = `❌ **Erro na Consulta**\n\n${resultado.erro}`;
        await this.sendMessage(fromNumber, mensagem);
        logger.warn(`Erro na consulta de pertences para ${senderName}: ${resultado.erro}`);
      }
      
    } catch (error) {
      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      
      const mensagem = '❌ Não foi possível realizar a consulta no momento. Tente novamente mais tarde.';
      await this.sendMessage(fromNumber, mensagem);
      
      logger.error(`Erro ao processar consulta de pertences para ${senderName}:`, error.message);
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
