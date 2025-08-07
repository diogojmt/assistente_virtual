const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const logger = require("./logger");
const OpenAIService = require("./openai-service");
const AudioTranscriptionService = require("./audio-transcription-service");
const TextToSpeechService = require("./text-to-speech-service");
const TextNormalizer = require("./text-normalizer");

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.openaiService = new OpenAIService();
    this.audioService = new AudioTranscriptionService();
    this.ttsService = new TextToSpeechService();
    this.textNormalizer = new TextNormalizer();
    this.pendingAudioRequests = new Map(); // Armazena solicitações de áudio pendentes
    this.audioPreferences = new Map(); // Armazena preferências de áudio por usuário
    this.lastUserMessages = new Map(); // Armazena últimas mensagens para contexto emocional
  }

  async initialize() {
    try {
      logger.info("Inicializando bot do WhatsApp...");

      // Configurar autenticação
      const { state, saveCreds } = await useMultiFileAuthState(
        "auth_info_baileys"
      );

      // Criar socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ module: "baileys" }),
        browser: Browsers.macOS("Desktop"),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });

      // Event listeners
      this.setupEventListeners(saveCreds);

      logger.info("Bot inicializado com sucesso");
    } catch (error) {
      logger.error("Erro ao inicializar bot:", error.message);
      throw error;
    }
  }

  setupEventListeners(saveCreds) {
    // Conexão
    this.sock.ev.on("connection.update", (update) => {
      this.handleConnectionUpdate(update);
    });

    // Credenciais
    this.sock.ev.on("creds.update", saveCreds);

    // Mensagens
    this.sock.ev.on("messages.upsert", async (messageUpdate) => {
      await this.handleIncomingMessages(messageUpdate);
    });
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("=".repeat(60));
      logger.info("QR CODE PARA WHATSAPP - Escaneie com seu celular:");
      logger.info("Se o QR estiver muito grande, diminua o zoom do terminal");
      logger.info("Ou copie este link e abra no navegador para ver o QR:");
      logger.info(
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
          qr
        )}`
      );
      logger.info("=".repeat(60));
      qrcode.generate(qr, { small: true });
      logger.info("=".repeat(60));
      logger.info("Aguardando conexão...");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.info(`Conexão fechada. Motivo: ${statusCode}`);

      if (
        statusCode === DisconnectReason.connectionClosed ||
        statusCode === DisconnectReason.connectionLost ||
        statusCode === DisconnectReason.restartRequired
      ) {
        logger.info("Tentando reconectar em 5 segundos...");
        setTimeout(() => this.initialize(), 5000);
      } else if (
        statusCode === 401 ||
        statusCode === DisconnectReason.loggedOut
      ) {
        logger.info(
          "Sessão expirada. Delete a pasta auth_info_baileys e reinicie o bot para gerar novo QR."
        );
      } else if (shouldReconnect) {
        logger.info("Tentando reconectar em 10 segundos...");
        setTimeout(() => this.initialize(), 10000);
      } else {
        logger.info("Desconectado. Por favor, reinicie o bot.");
      }
    } else if (connection === "open") {
      logger.info("Bot conectado ao WhatsApp com sucesso!");
    } else if (connection === "connecting") {
      logger.info("Conectando ao WhatsApp...");
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
      logger.error("Erro ao processar mensagens:", error.message);
    }
  }

  async processMessage(message) {
    try {
      // Ignorar mensagens do próprio bot
      if (message.key.fromMe) return;

      // Ignorar mensagens de status
      if (message.key.remoteJid === "status@broadcast") return;

      const fromNumber = message.key.remoteJid;
      const senderName = message.pushName || "Usuário";

      // Verificar se é mensagem de áudio
      const audioMessage = message.message?.audioMessage;
      if (audioMessage) {
        await this.processAudioMessage(message, fromNumber, senderName);
        return;
      }

      // Verificar se é mensagem de texto
      const messageText =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text;

      if (!messageText) return;

      logger.info(
        `Mensagem recebida de ${senderName} (${fromNumber}): "${messageText}"`
      );

      // Processar mensagem de texto
      await this.processTextMessage(messageText, fromNumber, senderName);
    } catch (error) {
      logger.error("Erro geral no processamento da mensagem:", error.message);
      logger.error("Stack:", error.stack);
    }
  }

  async processTextMessage(messageText, fromNumber, senderName) {
    try {
      // Verificar se é uma solicitação de áudio
      const audioRequestType = this.isAudioRequest(messageText);
      if (audioRequestType === 'disable') {
        // Desabilitar preferência de áudio
        this.audioPreferences.delete(fromNumber);
        await this.sendMessage(fromNumber, "✅ Preferência de áudio desabilitada. Agora só perguntarei se você quiser áudio.");
        return;
      } else if (audioRequestType === true) {
        await this.handleAudioRequest(fromNumber, senderName);
        return;
      }

      // Enviar indicador de "digitando"
      await this.sock.sendPresenceUpdate("composing", fromNumber);

      // Armazenar última mensagem do usuário para contexto emocional
      this.lastUserMessages.set(fromNumber, messageText);
      
      // Normalizar texto (limpar números com caracteres especiais)
      const normalizedText = this.textNormalizer.normalizeText(messageText);

      // Processar SEMPRE com OpenAI Assistant (principal) - mantendo contexto por usuário
      const response = await this.openaiService.processMessage(
        normalizedText,
        fromNumber
      );

      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate("paused", fromNumber);

      // Enviar resposta com pergunta sobre áudio
      await this.sendMessageWithAudioPrompt(fromNumber, response);

      logger.info(
        `Resposta enviada para ${senderName}: "${response.substring(
          0,
          100
        )}..."`
      );
    } catch (error) {
      // Parar indicador de "digitando"
      await this.sock.sendPresenceUpdate("paused", fromNumber);

      // Enviar mensagem de erro específica baseada no tipo
      let errorMessage = "Desculpe, ocorreu um erro ao processar sua mensagem.";
      
      if (error.message.includes('thread') || error.message.includes('OpenAI')) {
        errorMessage += ' Problema temporário com o sistema de IA. Tente novamente.';
      } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        errorMessage += ' Timeout na resposta. Tente uma pergunta mais simples.';
      } else if (error.message.includes('rate') || error.message.includes('429')) {
        errorMessage += ' Sistema ocupado. Aguarde alguns minutos.';
      } else {
        errorMessage += ' Tente novamente em alguns instantes.';
      }
      
      await this.sendMessage(fromNumber, errorMessage);

      logger.error(
        `❌ Erro ao processar mensagem de ${senderName}:`,
        error.message
      );
      logger.error('Stack trace:', error.stack);
    }
  }

  async processAudioMessage(message, fromNumber, senderName) {
    try {
      const audioMessage = message.message.audioMessage;
      const durationSeconds = audioMessage.seconds || 0;

      logger.info(
        `Áudio recebido de ${senderName} (${fromNumber}): ${durationSeconds}s`
      );

      // Verificar duração máxima (30 segundos)
      if (durationSeconds > 30) {
        await this.sendMessage(
          fromNumber,
          "⚠️ Áudio muito longo. Por favor, envie um áudio de até 30 segundos."
        );
        return;
      }

      // Enviar indicador de "gravando áudio" para mostrar que está processando
      await this.sock.sendPresenceUpdate("recording", fromNumber);

      try {
        // Fazer download do áudio
        logger.info("Fazendo download do áudio...");
        const audioBuffer = await downloadMediaMessage(message, "buffer", {});

        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error("Falha no download do áudio");
        }

        logger.info(`Áudio baixado: ${audioBuffer.length} bytes`);

        // Alterar para "digitando" durante transcrição
        await this.sock.sendPresenceUpdate("composing", fromNumber);

        // Transcrever áudio
        logger.info("Iniciando transcrição...");
        const transcription = await this.audioService.processAudio(
          audioBuffer,
          "whatsapp_audio",
          30
        );

        if (!transcription || transcription.trim().length === 0) {
          throw new Error("Transcrição vazia ou inválida");
        }

        logger.info(`Transcrição concluída: "${transcription}"`);

        // Normalizar texto transcrito (limpar números com caracteres especiais)
        const normalizedTranscription =
          this.textNormalizer.normalizeText(transcription);

        // Enviar confirmação da transcrição (mostra versão normalizada se houver diferença)
        const confirmationMessage =
          normalizedTranscription !== transcription
            ? `🎤 Transcrevi seu áudio: "${transcription}"\n✅ Texto normalizado: "${normalizedTranscription}"`
            : `🎤 Transcrevi seu áudio: "${transcription}"`;
        await this.sendMessage(fromNumber, confirmationMessage);

        // Enviar mensagem de processamento para dar feedback ao usuário
        await this.sendMessage(
          fromNumber,
          "🤖 Processando sua consulta, aguarde uns instantes..."
        );

        // Verificar se usuário pediu áudio na transcrição
        const audioRequestType = this.isAudioRequest(normalizedTranscription);
        if (audioRequestType === 'disable') {
          // Desabilitar preferência de áudio
          this.audioPreferences.delete(fromNumber);
          await this.sendMessage(fromNumber, "✅ Preferência de áudio desabilitada. Agora só perguntarei se você quiser áudio.");
          return;
        } else if (audioRequestType === true) {
          // Usuário pediu áudio - ativar preferência automática
          this.audioPreferences.set(fromNumber, {
            preferAudio: true,
            timestamp: Date.now(),
            lastMessage: normalizedTranscription
          });
          logger.info(`🎧 Usuário ${fromNumber.substring(0, 10)}... solicitou áudio via transcrição, ativando preferência automática`);
        }

        // Processar o texto transcrito normalizado como uma mensagem normal
        logger.info("Processando texto transcrito normalizado...");
        const response = await this.openaiService.processMessage(
          normalizedTranscription,
          fromNumber
        );

        // Parar indicador de "digitando"
        await this.sock.sendPresenceUpdate("paused", fromNumber);

        // Enviar resposta baseada na transcrição com pergunta sobre áudio
        await this.sendMessageWithAudioPrompt(fromNumber, response);

        logger.info(
          `Resposta ao áudio enviada para ${senderName}: "${response.substring(
            0,
            100
          )}..."`
        );
      } catch (error) {
        // Parar indicadores
        await this.sock.sendPresenceUpdate("paused", fromNumber);

        let errorMessage = "Desculpe, não consegui processar seu áudio. ";

        if (error.message.includes("FFmpeg")) {
          errorMessage =
            "⚠️ Sistema de transcrição indisponível.\n\n" +
            "O FFmpeg não está instalado no servidor.\n" +
            "Por favor, envie sua mensagem em texto.";
        } else if (error.message.includes("muito grande")) {
          errorMessage += "O arquivo é muito grande.";
        } else if (error.message.includes("muito longo")) {
          errorMessage += "O áudio é muito longo (máximo 30 segundos).";
        } else if (error.message.includes("formato")) {
          errorMessage += "Formato de áudio não suportado.";
        } else if (
          error.message.includes("timeout") ||
          error.message.includes("Timeout")
        ) {
          errorMessage += "Tempo esgotado. Tente com um áudio mais curto.";
        } else {
          errorMessage += "Tente novamente ou envie uma mensagem de texto.";
        }

        await this.sendMessage(fromNumber, errorMessage);

        logger.error(
          `Erro ao processar áudio de ${senderName}:`,
          error.message
        );
      }
    } catch (error) {
      await this.sock.sendPresenceUpdate("paused", fromNumber);
      logger.error("Erro geral no processamento de áudio:", error.message);
    }
  }

  /**
   * Verifica se a mensagem é uma solicitação de áudio
   */
  isAudioRequest(messageText) {
    const text = messageText.toLowerCase().trim();

    // Verificar se é comando para desabilitar áudio
    const disableCommands = ['parar áudio', 'desabilitar áudio', 'sem áudio', 'só texto'];
    if (disableCommands.some(cmd => text.includes(cmd))) {
      return 'disable';
    }

    // Palavras que indicam solicitação de áudio
    const audioKeywords = [
      "audio", "áudio", "som", "escutar", "ouvir", "falar",
      "responda em áudio", "responda em alto", "só responda em áudio",
      "quero áudio", "em voz", "falando", "voz", "oral", "sonoro"
    ];

    // Emojis relacionados a áudio
    const audioEmojis = [
      "🎧",
      "🔊",
      "🔉",
      "🔇",
      "📢",
      "📣",
      "🎵",
      "🎶",
      "🎙️",
      "📻",
    ];

    // Verificar palavras-chave
    if (audioKeywords.some((keyword) => text.includes(keyword))) {
      return true;
    }

    // Verificar emojis
    if (audioEmojis.some((emoji) => messageText.includes(emoji))) {
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
        // Se não há resposta pendente, mas usuário solicitou áudio, 
        // interpretar como preferência para próximas respostas
        this.audioPreferences.set(fromNumber, {
          preferAudio: true,
          timestamp: Date.now(),
          lastMessage: "" // Para contexto emocional
        });
        
        await this.sendMessage(
          fromNumber,
          "✅ Entendi que você prefere respostas em áudio! 🎧\n\nAgora faça sua pergunta que eu responderei automaticamente em texto e áudio."
        );
        return;
      }

      logger.info(`Processando solicitação de áudio de ${senderName}`);

      // Enviar indicador de "gravando áudio"
      await this.sock.sendPresenceUpdate("recording", fromNumber);

      try {
        // Usar voz baseada no contexto emocional ou padrão
        const voice = pendingResponse.voice || "nova";
        logger.info(`🎭 Usando voz "${voice}" baseada no contexto emocional`);
        
        // Gerar áudio usando TTS (mp3 é mais compatível)
        const audioFilePath = await this.ttsService.generateAudio(
          pendingResponse.text,
          voice,
          "mp3"
        );

        // Enviar áudio via WhatsApp
        await this.sendAudioMessage(fromNumber, audioFilePath);

        // Remover da lista de pendentes após envio bem-sucedido
        this.pendingAudioRequests.delete(fromNumber);

        // Limpeza do arquivo temporário após um tempo
        setTimeout(() => {
          this.ttsService.removeFile(audioFilePath).catch((error) => {
            logger.warn("Erro ao limpar arquivo TTS:", error.message);
          });
        }, 60000); // 1 minuto

        logger.info(`Áudio TTS enviado com sucesso para ${senderName}`);
      } catch (error) {
        logger.error(
          `❌ Erro ao gerar/enviar áudio para ${senderName}:`,
          error.message
        );
        logger.error("Stack trace:", error.stack);

        let errorMessage = "❌ Não foi possível enviar o áudio. ";

        if (
          error.message.includes("muito longo") ||
          error.message.includes("4096")
        ) {
          errorMessage += "A resposta é muito longa para conversão em áudio.";
        } else if (
          error.message.includes("rate") ||
          error.message.includes("429")
        ) {
          errorMessage +=
            "Limite de uso da API excedido. Tente novamente em alguns minutos.";
        } else if (error.message.includes("timeout")) {
          errorMessage += "Timeout na geração. Tente novamente.";
        } else if (
          error.message.includes("muito grande") ||
          error.message.includes("16MB")
        ) {
          errorMessage += "Arquivo de áudio muito grande.";
        } else if (error.message.includes("formato")) {
          errorMessage += "Formato de áudio não suportado.";
        } else if (
          error.message.includes("autenticação") ||
          error.message.includes("401")
        ) {
          errorMessage += "Erro de configuração. Contate o suporte.";
        } else {
          errorMessage +=
            "Tente novamente em alguns instantes ou continue usando mensagens de texto.";
        }

        await this.sendMessage(fromNumber, errorMessage);
      } finally {
        // Parar indicador de "gravando áudio"
        await this.sock.sendPresenceUpdate("paused", fromNumber);
      }
    } catch (error) {
      await this.sock.sendPresenceUpdate("paused", fromNumber);
      logger.error(
        "Erro geral no processamento de solicitação de áudio:",
        error.message
      );
    }
  }

  /**
   * Converte números para formato natural falado
   */
  formatNumbersForAudio(text) {
    // Valores em reais (R$ 1.200,00 → "mil e duzentos reais")
    text = text.replace(/R\$\s*(\d{1,3}(?:\.\d{3})*),(\d{2})/g, (match, reais, centavos) => {
      const valor = parseInt(reais.replace(/\./g, ''));
      const centavosNum = parseInt(centavos);
      
      let valorPorExtenso = this.numberToWords(valor);
      
      if (centavosNum > 0) {
        return `${valorPorExtenso} reais e ${this.numberToWords(centavosNum)} centavos`;
      } else {
        return `${valorPorExtenso} reais`;
      }
    });
    
    // Porcentagens (15% → "quinze por cento")
    text = text.replace(/(\d+)%/g, (match, num) => {
      return `${this.numberToWords(parseInt(num))} por cento`;
    });
    
    // CEP (12345-678 → "CEP doze mil trezentos e quarenta e cinco hífen seiscentos e setenta e oito")
    text = text.replace(/(\d{5})-(\d{3})/g, (match, parte1, parte2) => {
      return `CEP ${this.numberToWords(parseInt(parte1))} hífen ${this.numberToWords(parseInt(parte2))}`;
    });
    
    return text;
  }

  /**
   * Converte datas para formato natural
   */
  formatDatesForAudio(text) {
    // DD/MM/YYYY → "dez de agosto de dois mil e vinte e cinco"
    text = text.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (match, dia, mes, ano) => {
      const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
      ];
      
      const diaNum = parseInt(dia);
      const mesNum = parseInt(mes) - 1;
      const anoNum = parseInt(ano);
      
      const diaPorExtenso = this.numberToWords(diaNum);
      const mesNome = meses[mesNum] || 'mês inválido';
      const anoPorExtenso = this.numberToWords(anoNum);
      
      return `${diaPorExtenso} de ${mesNome} de ${anoPorExtenso}`;
    });
    
    return text;
  }

  /**
   * Expande abreviações comuns para áudio
   */
  expandAbbreviationsForAudio(text) {
    const abbreviations = {
      'IPTU': 'Imposto Predial e Territorial Urbano',
      'CPF': 'CPF',
      'CNPJ': 'CNPJ', 
      'RG': 'RG',
      'CEP': 'CEP',
      'ISSQN': 'Imposto Sobre Serviços',
      'ITBI': 'Imposto de Transmissão de Bens Imóveis',
      'Dr.': 'Doutor',
      'Dra.': 'Doutora',
      'Sr.': 'Senhor',
      'Sra.': 'Senhora',
      'Ltda.': 'Limitada',
      'S.A.': 'Sociedade Anônima'
    };
    
    for (const [abbrev, expansion] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      text = text.replace(regex, expansion);
    }
    
    return text;
  }

  /**
   * Converte números para palavras (versão simplificada)
   */
  numberToWords(num) {
    if (num === 0) return 'zero';
    if (num === 1) return 'um';
    if (num === 2) return 'dois';
    if (num === 3) return 'três';
    if (num === 4) return 'quatro';
    if (num === 5) return 'cinco';
    if (num === 6) return 'seis';
    if (num === 7) return 'sete';
    if (num === 8) return 'oito';
    if (num === 9) return 'nove';
    if (num === 10) return 'dez';
    
    if (num < 20) {
      const teens = ['onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
      return teens[num - 11];
    }
    
    if (num < 100) {
      const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
      const unidade = num % 10;
      const dezena = Math.floor(num / 10);
      
      if (unidade === 0) {
        return tens[dezena];
      } else {
        return `${tens[dezena]} e ${this.numberToWords(unidade)}`;
      }
    }
    
    if (num < 1000) {
      const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
      const centena = Math.floor(num / 100);
      const resto = num % 100;
      
      if (num === 100) return 'cem';
      
      if (resto === 0) {
        return centenas[centena];
      } else {
        return `${centenas[centena]} e ${this.numberToWords(resto)}`;
      }
    }
    
    if (num < 1000000) {
      const milhares = Math.floor(num / 1000);
      const resto = num % 1000;
      
      let result = '';
      if (milhares === 1) {
        result = 'mil';
      } else {
        result = `${this.numberToWords(milhares)} mil`;
      }
      
      if (resto > 0) {
        result += ` e ${this.numberToWords(resto)}`;
      }
      
      return result;
    }
    
    // Para números maiores, usar formato simplificado
    return num.toString();
  }

  /**
   * Obtém a última mensagem do usuário para contexto emocional
   */
  getLastUserMessage(fromNumber) {
    return this.lastUserMessages.get(fromNumber) || "";
  }

  /**
   * Detecta contexto emocional e ajusta o tom da resposta
   */
  detectEmotionalContext(userMessage, botResponse) {
    const message = userMessage.toLowerCase();
    const response = botResponse.toLowerCase();
    
    // Detectar urgência
    const urgencyKeywords = ['urgente', 'rápido', 'preciso agora', 'emergência', 'dívida', 'cobrança'];
    const hasUrgency = urgencyKeywords.some(keyword => message.includes(keyword));
    
    // Detectar frustração
    const frustrationKeywords = ['não funciona', 'erro', 'problema', 'não consigo', 'difícil'];
    const hasFrustration = frustrationKeywords.some(keyword => message.includes(keyword));
    
    // Detectar agradecimento
    const gratitudeKeywords = ['obrigado', 'obrigada', 'valeu', 'muito bom', 'excelente'];
    const hasGratitude = gratitudeKeywords.some(keyword => message.includes(keyword));
    
    // Detectar valores altos (possível preocupação)
    const highValuePattern = /R\$\s*(\d{1,3}(?:\.\d{3})*),(\d{2})/g;
    const matches = response.match(highValuePattern);
    const hasHighValue = matches && matches.some(match => {
      const value = parseFloat(match.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.'));
      return value > 500; // Valores acima de R$ 500
    });
    
    return {
      hasUrgency,
      hasFrustration,
      hasGratitude,
      hasHighValue,
      suggestedVoice: this.selectVoiceForContext({ hasUrgency, hasFrustration, hasGratitude, hasHighValue })
    };
  }

  /**
   * Seleciona a melhor voz baseada no contexto emocional
   */
  selectVoiceForContext(context) {
    // Vozes OpenAI disponíveis: alloy, echo, fable, onyx, nova, shimmer
    
    if (context.hasGratitude) {
      return 'nova'; // Voz mais calorosa para agradecimentos
    }
    
    if (context.hasFrustration) {
      return 'fable'; // Voz mais calma e tranquilizadora
    }
    
    if (context.hasUrgency || context.hasHighValue) {
      return 'alloy'; // Voz mais séria e profissional
    }
    
    return 'nova'; // Voz padrão, equilibrada
  }

  /**
   * Melhora a pontuação para pausas mais naturais no áudio
   */
  improvePunctuationForAudio(text) {
    // Adicionar pausas após valores monetários
    text = text.replace(/(reais?)\s+([A-Z])/g, '$1. $2');
    
    // Adicionar pausas após datas
    text = text.replace(/(\d{4})\s+([A-Z])/g, '$1. $2');
    
    // Melhorar pausas em listas
    text = text.replace(/,\s*([A-Z])/g, ', $1');
    
    // Pausas naturais antes de informações importantes
    text = text.replace(/\b(atenção|importante|lembre-se|observação)\b/gi, '. $1');
    
    // Pausas após cumprimentos
    text = text.replace(/\b(olá|oi|bom dia|boa tarde|boa noite)\b/gi, '$1,');
    
    return text;
  }

  /**
   * Verifica se o texto contém links e os trata adequadamente para áudio
   */
  processTextForAudio(text) {
    // 1. Processar números e valores
    text = this.formatNumbersForAudio(text);
    
    // 2. Processar datas
    text = this.formatDatesForAudio(text);
    
    // 3. Expandir abreviações
    text = this.expandAbbreviationsForAudio(text);
    
    // 4. Melhorar pontuação para pausas naturais
    text = this.improvePunctuationForAudio(text);
    
    // 5. Detectar URLs (http, https, www, .com, .br, etc.)
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+\.(com|br|org|net|gov|edu)[^\s]*)/gi;
    const links = text.match(urlRegex) || [];
    
    if (links.length === 0) {
      return { hasLinks: false, audioText: text };
    }
    
    // Se tem muitos links (mais de 2), não oferecer áudio
    if (links.length > 2) {
      return { hasLinks: true, tooManyLinks: true, audioText: null };
    }
    
    // Substituir links por texto mais natural para áudio
    let audioText = text;
    links.forEach((link, index) => {
      if (links.length === 1) {
        audioText = audioText.replace(link, ", confira o link enviado no texto,");
      } else {
        audioText = audioText.replace(link, `, confira o link ${index + 1} no texto,`);
      }
    });
    
    // Limpar vírgulas duplas e espaços extras
    audioText = audioText.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
    
    return { hasLinks: true, audioText: audioText };
  }

  /**
   * Envia resposta de texto com pergunta sobre áudio (ou gera áudio automaticamente se usuário preferir)
   */
  async sendMessageWithAudioPrompt(fromNumber, responseText) {
    try {
      // Enviar a resposta principal
      await this.sendMessage(fromNumber, responseText);

      // Verificar se o texto contém links
      const linkAnalysis = this.processTextForAudio(responseText);
      
      // Se tem muitos links, não oferecer áudio
      if (linkAnalysis.tooManyLinks) {
        logger.info(`🔗 Resposta com muitos links (${linkAnalysis.hasLinks}), pulando oferta de áudio`);
        return;
      }

      // Verificar se usuário tem preferência por áudio
      const audioPreference = this.audioPreferences.get(fromNumber);
      const prefersAudio = audioPreference && 
                          audioPreference.preferAudio && 
                          (Date.now() - audioPreference.timestamp) < (60 * 60 * 1000); // 1 hora
      
      if (prefersAudio) {
        // Usuário prefere áudio - gerar automaticamente
        logger.info(`🎧 Usuário ${fromNumber.substring(0, 10)}... prefere áudio, gerando automaticamente`);
        
        await this.sendMessage(fromNumber, "🎧 Gerando áudio automaticamente...");
        
        try {
          // Usar texto processado para áudio (sem links)
          const textForAudio = linkAnalysis.audioText || responseText;
          
          // Gerar e enviar áudio diretamente
          const audioFilePath = await this.ttsService.generateAudio(textForAudio, 'nova', 'mp3');
          await this.sendAudioMessage(fromNumber, audioFilePath);
          
          // Limpeza do arquivo após envio
          setTimeout(() => {
            this.ttsService.removeFile(audioFilePath).catch(error => {
              logger.warn('Erro ao limpar arquivo TTS:', error.message);
            });
          }, 60000); // 1 minuto
          
        } catch (audioError) {
          logger.error('Erro ao gerar áudio automático:', audioError.message);
          await this.sendMessage(fromNumber, "❌ Erro ao gerar áudio. Continuando só com texto.");
        }
        
      } else {
        // Comportamento normal - perguntar sobre áudio
        // Armazenar resposta para possível conversão em áudio (usando texto processado)
        const textForAudio = linkAnalysis.audioText || responseText;
        
        // Detectar contexto emocional para escolher voz adequada
        const lastMessage = this.getLastUserMessage(fromNumber) || "";
        const emotionalContext = this.detectEmotionalContext(lastMessage, responseText);
        
        this.pendingAudioRequests.set(fromNumber, {
          text: textForAudio,
          timestamp: Date.now(),
          voice: emotionalContext.suggestedVoice,
          context: emotionalContext
        });

        // Limpar solicitações antigas (mais de 10 minutos)
        this.cleanupPendingAudioRequests();

        // Enviar pergunta sobre áudio (com aviso sobre links se necessário)
        let audioPrompt = "\n🎧 Deseja ouvir essa resposta em áudio? Responda com 'áudio' ou envie um emoji de fone 🎧.";
        
        if (linkAnalysis.hasLinks) {
          audioPrompt = "\n🎧 Deseja ouvir essa resposta em áudio? (Os links serão mencionados como 'confira o link no texto')";
        }
        
        await this.sendMessage(fromNumber, audioPrompt);
      }
      
    } catch (error) {
      logger.error(
        "Erro ao enviar mensagem com prompt de áudio:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Envia mensagem de áudio via WhatsApp
   */
  async sendAudioMessage(to, audioFilePath) {
    try {
      const fs = require("fs-extra");
      const path = require("path");

      if (!(await fs.pathExists(audioFilePath))) {
        throw new Error("Arquivo de áudio não encontrado");
      }

      // Verificar tamanho do arquivo (limite menor no Replit)
      const stats = await fs.stat(audioFilePath);
      const maxSize =
        process.env.NODE_ENV === "production"
          ? 3 * 1024 * 1024
          : 16 * 1024 * 1024; // 3MB no Replit
      if (stats.size > maxSize) {
        throw new Error(
          `Arquivo de áudio muito grande (máximo ${Math.round(
            maxSize / 1024 / 1024
          )}MB no Replit)`
        );
      }

      // Ler arquivo de áudio
      const audioBuffer = await fs.readFile(audioFilePath);

      // Determinar mimetype baseado na extensão
      const fileExtension = path.extname(audioFilePath).toLowerCase();
      let mimetype = "audio/mpeg"; // Default para MP3

      switch (fileExtension) {
        case ".mp3":
          mimetype = "audio/mpeg";
          break;
        case ".mp4":
          mimetype = "audio/mp4";
          break;
        case ".opus":
          mimetype = "audio/opus";
          break;
        case ".ogg":
          mimetype = "audio/ogg";
          break;
        case ".aac":
          mimetype = "audio/aac";
          break;
        case ".flac":
          mimetype = "audio/flac";
          break;
      }

      logger.info(
        `📤 Enviando áudio: ${path.basename(audioFilePath)} (${(
          stats.size / 1024
        ).toFixed(1)}KB, ${mimetype})`
      );

      // Tentar múltiplas abordagens de envio
      let messageResponse;

      try {
        // Abordagem 1: Envio direto como PTT (nota de voz) - otimizado para Replit
        const audioPayload = {
          audio: audioBuffer,
          mimetype: mimetype,
          ptt: true,
        };

        // No Replit, adicionar configurações extras para estabilidade
        if (process.env.NODE_ENV === "production") {
          audioPayload.quoted = null; // Remover referências desnecessárias
        }

        messageResponse = await this.sock.sendMessage(to, audioPayload);

        logger.info(
          `✅ Áudio enviado como PTT - ID: ${messageResponse?.key?.id}`
        );
      } catch (pttError) {
        logger.warn(
          "❌ Falha no envio PTT, tentando como áudio normal:",
          pttError.message
        );

        // Abordagem 2: Envio como áudio normal (sem PTT)
        try {
          messageResponse = await this.sock.sendMessage(to, {
            audio: audioBuffer,
            mimetype: mimetype,
            ptt: false,
            fileName: `audio_tts${fileExtension}`,
          });

          logger.info(
            `✅ Áudio enviado como arquivo - ID: ${messageResponse?.key?.id}`
          );
        } catch (normalError) {
          logger.warn(
            "❌ Falha no envio normal, tentando como caminho direto (Replit):",
            normalError.message
          );

          // Abordagem 3: Replit específica - envio via caminho do arquivo
          try {
            messageResponse = await this.sock.sendMessage(to, {
              audio: audioFilePath, // Passar caminho direto em vez de buffer
              mimetype: "audio/mpeg",
              ptt: true,
            });

            logger.info(
              `✅ Áudio enviado via caminho direto - ID: ${messageResponse?.key?.id}`
            );
          } catch (pathError) {
            logger.warn(
              "❌ Falha no envio via caminho, tentando MP3 mínimo:",
              pathError.message
            );

            // Abordagem 4: Configuração mínima como último recurso
            if (fileExtension !== ".mp3") {
              throw new Error(
                "Falha no envio de áudio - formato não suportado no Replit"
              );
            }

            messageResponse = await this.sock.sendMessage(to, {
              audio: audioBuffer,
              mimetype: "audio/mpeg",
              ptt: true,
            });

            logger.info(
              `✅ Áudio enviado como MP3 básico - ID: ${messageResponse?.key?.id}`
            );
          }
        }
      }

      // Verificar se a mensagem foi realmente enviada
      if (!messageResponse || !messageResponse.key) {
        throw new Error("Falha na confirmação de envio do áudio");
      }

      return messageResponse;
    } catch (error) {
      logger.error("❌ Erro crítico ao enviar áudio:", error.message);
      logger.error("Stack trace:", error.stack);
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
    
    // Limpar também preferências de áudio antigas (mais de 1 hora)
    const prefMaxAge = 60 * 60 * 1000; // 1 hora
    for (const [userId, data] of this.audioPreferences.entries()) {
      if (now - data.timestamp > prefMaxAge) {
        this.audioPreferences.delete(userId);
      }
    }
  }

  async sendMessage(to, text) {
    try {
      await this.sock.sendMessage(to, { text });
    } catch (error) {
      logger.error("Erro ao enviar mensagem:", error.message);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();

      // Configurar limpeza automática de arquivos temporários (a cada 30 minutos)
      setInterval(() => {
        // Limpeza de arquivos de transcrição
        this.audioService.cleanupOldTempFiles().catch((error) => {
          logger.warn(
            "Erro na limpeza automática de arquivos de transcrição:",
            error.message
          );
        });

        // Limpeza de arquivos TTS
        this.ttsService.cleanupOldTempFiles().catch((error) => {
          logger.warn(
            "Erro na limpeza automática de arquivos TTS:",
            error.message
          );
        });

        // Limpeza de solicitações de áudio antigas
        this.cleanupPendingAudioRequests();
        
        // Limpeza de threads OpenAI antigas/problemáticas
        const cleanedThreads = this.openaiService.cleanupThreads();
        if (cleanedThreads > 0) {
          logger.info(`🧹 ${cleanedThreads} threads OpenAI limpas automaticamente`);
        }
        
        // Log de estatísticas das threads (a cada hora)
        const threadStats = this.openaiService.getThreadStats();
        logger.info(`📊 Threads ativas: ${threadStats.totalThreads}, Detalhes: ${JSON.stringify(threadStats.threadDetails.slice(0, 3))}...`);
      }, 30 * 60 * 1000); // 30 minutos

      logger.info(
        "Limpeza automática de arquivos temporários configurada (30 min)"
      );
    } catch (error) {
      logger.error("Falha ao iniciar bot:", error.message);
      process.exit(1);
    }
  }
}

module.exports = WhatsAppBot;
