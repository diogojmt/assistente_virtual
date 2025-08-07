const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  Browsers,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const OpenAIService = require('./openai-service');
const AudioTranscriptionService = require('./audio-transcription-service');
const TextToSpeechService = require('./text-to-speech-service');
const TextNormalizer = require('./text-normalizer');

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.openaiService = new OpenAIService();
    this.audioService = new AudioTranscriptionService();
    this.ttsService = new TextToSpeechService();
    this.textNormalizer = new TextNormalizer();
    this.pendingAudioRequests = new Map(); // Armazena solicitações de áudio pendentes
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
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
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
        logger.info('Sessão expirada. Delete a pasta auth_info_baileys e reinicie o bot para gerar novo QR.');
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
      
      const fromNumber = message.key.remoteJid;
      const senderName = message.pushName || 'Usuário';
      
      // Verificar se é mensagem de áudio
      const audioMessage = message.message?.audioMessage;
      if (audioMessage) {
        await this.processAudioMessage(message, fromNumber, senderName);
        return;
      }
      
      // Verificar se é mensagem de texto
      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text;
      
      if (!messageText) return;
      
      logger.info(`Mensagem recebida de ${senderName} (${fromNumber}): "${messageText}"`);
      
      // Processar mensagem de texto
      await this.processTextMessage(messageText, fromNumber, senderName);
      
    } catch (error) {
      logger.error('Erro geral no processamento da mensagem:', error.message);
      logger.error('Stack:', error.stack);
    }
  }

  async processTextMessage(messageText, fromNumber, senderName) {
    try {
      // Verificar se é uma solicitação de áudio
      if (this.isAudioRequest(messageText)) {
        await this.handleAudioRequest(fromNumber, senderName);
        return;
      }

      // Enviar indicador de "digitando"
      await this.sock.sendPresenceUpdate('composing', fromNumber);
      
      // Normalizar texto (limpar números com caracteres especiais)
      const normalizedText = this.textNormalizer.normalizeText(messageText);
      
      // Processar SEMPRE com OpenAI Assistant (principal) - mantendo contexto por usuário
      const response = await this.openaiService.processMessage(normalizedText, fromNumber);
      
      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      
      // Enviar resposta com pergunta sobre áudio
      await this.sendMessageWithAudioPrompt(fromNumber, response);
      
      logger.info(`Resposta enviada para ${senderName}: "${response.substring(0, 100)}..."`);
      
    } catch (error) {
      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      
      // Enviar mensagem de erro genérica
      const errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
      await this.sendMessage(fromNumber, errorMessage);
      
      logger.error(`Erro ao processar mensagem de ${senderName}:`, error.message);
    }
  }

  async processAudioMessage(message, fromNumber, senderName) {
    try {
      const audioMessage = message.message.audioMessage;
      const durationSeconds = audioMessage.seconds || 0;
      
      logger.info(`Áudio recebido de ${senderName} (${fromNumber}): ${durationSeconds}s`);
      
      // Verificar duração máxima (30 segundos)
      if (durationSeconds > 30) {
        await this.sendMessage(fromNumber, '⚠️ Áudio muito longo. Por favor, envie um áudio de até 30 segundos.');
        return;
      }
      
      // Enviar indicador de "gravando áudio" para mostrar que está processando
      await this.sock.sendPresenceUpdate('recording', fromNumber);
      
      try {
        // Fazer download do áudio
        logger.info('Fazendo download do áudio...');
        const audioBuffer = await downloadMediaMessage(message, 'buffer', {});
        
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('Falha no download do áudio');
        }
        
        logger.info(`Áudio baixado: ${audioBuffer.length} bytes`);
        
        // Alterar para "digitando" durante transcrição
        await this.sock.sendPresenceUpdate('composing', fromNumber);
        
        // Transcrever áudio
        logger.info('Iniciando transcrição...');
        const transcription = await this.audioService.processAudio(audioBuffer, 'whatsapp_audio', 30);
        
        if (!transcription || transcription.trim().length === 0) {
          throw new Error('Transcrição vazia ou inválida');
        }
        
        logger.info(`Transcrição concluída: "${transcription}"`);
        
        // Normalizar texto transcrito (limpar números com caracteres especiais)
        const normalizedTranscription = this.textNormalizer.normalizeText(transcription);
        
        // Enviar confirmação da transcrição (mostra versão normalizada se houver diferença)
        const confirmationMessage = normalizedTranscription !== transcription 
          ? `🎤 Transcrevi seu áudio: "${transcription}"\n✅ Texto normalizado: "${normalizedTranscription}"`
          : `🎤 Transcrevi seu áudio: "${transcription}"`;
        await this.sendMessage(fromNumber, confirmationMessage);
        
        // Enviar mensagem de processamento para dar feedback ao usuário
        await this.sendMessage(fromNumber, "🤖 Processando sua consulta...");
        
        // Processar o texto transcrito normalizado como uma mensagem normal
        logger.info('Processando texto transcrito normalizado...');
        const response = await this.openaiService.processMessage(normalizedTranscription, fromNumber);
        
        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        // Enviar resposta baseada na transcrição com pergunta sobre áudio
        await this.sendMessageWithAudioPrompt(fromNumber, response);
        
        logger.info(`Resposta ao áudio enviada para ${senderName}: "${response.substring(0, 100)}..."`);
        
      } catch (error) {
        // Parar indicadores
        await this.sock.sendPresenceUpdate('paused', fromNumber);
        
        let errorMessage = 'Desculpe, não consegui processar seu áudio. ';
        
        if (error.message.includes('FFmpeg')) {
          errorMessage = '⚠️ Sistema de transcrição indisponível.\n\n' +
                        'O FFmpeg não está instalado no servidor.\n' +
                        'Por favor, envie sua mensagem em texto.';
        } else if (error.message.includes('muito grande')) {
          errorMessage += 'O arquivo é muito grande.';
        } else if (error.message.includes('muito longo')) {
          errorMessage += 'O áudio é muito longo (máximo 30 segundos).';
        } else if (error.message.includes('formato')) {
          errorMessage += 'Formato de áudio não suportado.';
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
          errorMessage += 'Tempo esgotado. Tente com um áudio mais curto.';
        } else {
          errorMessage += 'Tente novamente ou envie uma mensagem de texto.';
        }
        
        await this.sendMessage(fromNumber, errorMessage);
        
        logger.error(`Erro ao processar áudio de ${senderName}:`, error.message);
      }
      
    } catch (error) {
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      logger.error('Erro geral no processamento de áudio:', error.message);
    }
  }



  /**
   * Verifica se a mensagem é uma solicitação de áudio
   */
  isAudioRequest(messageText) {
    const text = messageText.toLowerCase().trim();
    
    // Palavras que indicam solicitação de áudio
    const audioKeywords = ['audio', 'áudio', 'som', 'escutar', 'ouvir', 'falar'];
    
    // Emojis relacionados a áudio
    const audioEmojis = ['🎧', '🔊', '🔉', '🔇', '📢', '📣', '🎵', '🎶', '🎙️', '📻'];
    
    // Verificar palavras-chave
    if (audioKeywords.some(keyword => text.includes(keyword))) {
      return true;
    }
    
    // Verificar emojis
    if (audioEmojis.some(emoji => messageText.includes(emoji))) {
      return true;
    }
    
    return false;
  }

  /**
   * Processa solicitação de áudio do usuário
   */
  async handleAudioRequest(fromNumber, senderName) {
    try {
      // Verificar se há uma resposta pendente para gerar áudio
      const pendingResponse = this.pendingAudioRequests.get(fromNumber);
      
      if (!pendingResponse) {
        await this.sendMessage(fromNumber, 'Não há nenhuma resposta recente para converter em áudio. Faça uma pergunta primeiro.');
        return;
      }
      
      logger.info(`Processando solicitação de áudio de ${senderName}`);
      
      // Enviar indicador de "gravando áudio"
      await this.sock.sendPresenceUpdate('recording', fromNumber);
      
      try {
        // Gerar áudio usando TTS
        const audioFilePath = await this.ttsService.generateAudio(pendingResponse.text, 'nova', 'opus');
        
        // Enviar áudio via WhatsApp
        await this.sendAudioMessage(fromNumber, audioFilePath);
        
        // Remover da lista de pendentes após envio bem-sucedido
        this.pendingAudioRequests.delete(fromNumber);
        
        // Limpeza do arquivo temporário após um tempo
        setTimeout(() => {
          this.ttsService.removeFile(audioFilePath).catch(error => {
            logger.warn('Erro ao limpar arquivo TTS:', error.message);
          });
        }, 60000); // 1 minuto
        
        logger.info(`Áudio TTS enviado com sucesso para ${senderName}`);
        
      } catch (error) {
        logger.error(`Erro ao gerar/enviar áudio para ${senderName}:`, error.message);
        
        let errorMessage = '❌ Não foi possível gerar o áudio. ';
        
        if (error.message.includes('muito longo')) {
          errorMessage += 'A resposta é muito longa para conversão em áudio.';
        } else if (error.message.includes('rate')) {
          errorMessage += 'Limite de uso da API excedido. Tente novamente em alguns minutos.';
        } else if (error.message.includes('timeout')) {
          errorMessage += 'Timeout na geração. Tente novamente.';
        } else {
          errorMessage += 'Tente novamente em alguns instantes.';
        }
        
        await this.sendMessage(fromNumber, errorMessage);
      } finally {
        // Parar indicador de "gravando áudio"
        await this.sock.sendPresenceUpdate('paused', fromNumber);
      }
      
    } catch (error) {
      await this.sock.sendPresenceUpdate('paused', fromNumber);
      logger.error('Erro geral no processamento de solicitação de áudio:', error.message);
    }
  }

  /**
   * Envia resposta de texto com pergunta sobre áudio
   */
  async sendMessageWithAudioPrompt(fromNumber, responseText) {
    try {
      // Enviar a resposta principal
      await this.sendMessage(fromNumber, responseText);
      
      // Armazenar resposta para possível conversão em áudio
      this.pendingAudioRequests.set(fromNumber, {
        text: responseText,
        timestamp: Date.now()
      });
      
      // Limpar solicitações antigas (mais de 10 minutos)
      this.cleanupPendingAudioRequests();
      
      // Enviar pergunta sobre áudio
      const audioPrompt = "\n🎧 Deseja ouvir essa resposta em áudio? Responda com 'áudio' ou envie um emoji de fone 🎧.";
      await this.sendMessage(fromNumber, audioPrompt);
      
    } catch (error) {
      logger.error('Erro ao enviar mensagem com prompt de áudio:', error.message);
      throw error;
    }
  }

  /**
   * Envia mensagem de áudio via WhatsApp
   */
  async sendAudioMessage(to, audioFilePath) {
    try {
      const fs = require('fs-extra');
      
      if (!await fs.pathExists(audioFilePath)) {
        throw new Error('Arquivo de áudio não encontrado');
      }
      
      // Ler arquivo de áudio
      const audioBuffer = await fs.readFile(audioFilePath);
      
      // Enviar como mensagem de voz (PTT = Push To Talk)
      await this.sock.sendMessage(to, {
        audio: audioBuffer,
        mimetype: 'audio/opus',
        ptt: true // Marca como mensagem de voz
      });
      
      logger.info(`Áudio enviado: ${audioFilePath} (${audioBuffer.length} bytes)`);
    } catch (error) {
      logger.error('Erro ao enviar áudio:', error.message);
      throw error;
    }
  }

  /**
   * Remove solicitações de áudio antigas
   */
  cleanupPendingAudioRequests() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutos
    
    for (const [userId, data] of this.pendingAudioRequests.entries()) {
      if (now - data.timestamp > maxAge) {
        this.pendingAudioRequests.delete(userId);
      }
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
      
      // Configurar limpeza automática de arquivos temporários (a cada 30 minutos)
      setInterval(() => {
        // Limpeza de arquivos de transcrição
        this.audioService.cleanupOldTempFiles().catch(error => {
          logger.warn('Erro na limpeza automática de arquivos de transcrição:', error.message);
        });
        
        // Limpeza de arquivos TTS
        this.ttsService.cleanupOldTempFiles().catch(error => {
          logger.warn('Erro na limpeza automática de arquivos TTS:', error.message);
        });
        
        // Limpeza de solicitações de áudio antigas
        this.cleanupPendingAudioRequests();
      }, 30 * 60 * 1000); // 30 minutos
      
      logger.info('Limpeza automática de arquivos temporários configurada (30 min)');
      
    } catch (error) {
      logger.error('Falha ao iniciar bot:', error.message);
      process.exit(1);
    }
  }
}

module.exports = WhatsAppBot;
