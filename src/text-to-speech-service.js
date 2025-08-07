const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class TextToSpeechService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.audioCache = new Map(); // Cache básico para evitar regeneração
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY deve estar definida no arquivo .env');
    }
    
    // Garantir que o diretório temporário existe
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.ensureDir(this.tempDir);
      logger.info('Diretório temporário TTS criado/verificado:', this.tempDir);
    } catch (error) {
      logger.error('Erro ao criar diretório temporário TTS:', error.message);
    }
  }

  /**
   * Gera hash simples para cache básico
   */
  generateTextHash(text) {
    return Buffer.from(text).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }

  /**
   * Gera áudio usando OpenAI TTS API
   * @param {string} text - Texto para converter em áudio
   * @param {string} voice - Voz a usar (alloy, echo, fable, onyx, nova, shimmer)
   * @param {string} format - Formato do áudio (mp3, opus, aac, flac)
   * @returns {Promise<string>} Caminho do arquivo gerado
   */
  async generateAudio(text, voice = 'nova', format = 'mp3') {
    try {
      // Validar parâmetros
      if (!text || text.trim().length === 0) {
        throw new Error('Texto não pode estar vazio');
      }

      // Replit tem limitações de recursos - usar textos menores
      const maxLength = process.env.NODE_ENV === 'production' ? 2000 : 4096;
      if (text.length > maxLength) {
        throw new Error(`Texto muito longo (máximo ${maxLength} caracteres para Replit)`);
      }

      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      if (!validVoices.includes(voice)) {
        voice = 'nova'; // Fallback para voz padrão
      }

      const validFormats = ['mp3', 'opus', 'aac', 'flac'];
      if (!validFormats.includes(format)) {
        format = 'mp3'; // Fallback para formato mp3 (mais compatível)
      }

      logger.info(`Gerando áudio TTS - Tamanho: ${text.length} chars, Voz: ${voice}, Formato: ${format}`);

      // Verificar cache básico
      const textHash = this.generateTextHash(text);
      const cacheKey = `${textHash}_${voice}_${format}`;
      
      if (this.audioCache.has(cacheKey)) {
        const cachedFile = this.audioCache.get(cacheKey);
        if (await fs.pathExists(cachedFile)) {
          logger.info('Áudio encontrado no cache:', cachedFile);
          return cachedFile;
        } else {
          // Arquivo não existe mais, remover do cache
          this.audioCache.delete(cacheKey);
        }
      }

      // Fazer requisição para OpenAI TTS (otimizado para Replit)
      const response = await axios.post(
        `${this.baseURL}/audio/speech`,
        {
          model: 'tts-1', // Modelo mais rápido e econômico
          input: text,
          voice: voice,
          response_format: format,
          speed: 1.1 // Ligeiramente mais rápido para economizar largura de banda
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: process.env.NODE_ENV === 'production' ? 20000 : 30000, // Timeout menor no Replit
          maxContentLength: 5 * 1024 * 1024, // Máximo 5MB para não sobrecarregar Replit
          maxBodyLength: 5 * 1024 * 1024
        }
      );

      // Salvar arquivo temporário
      const timestamp = Date.now();
      const fileName = `tts_${timestamp}_${textHash}.${format}`;
      const filePath = path.join(this.tempDir, fileName);

      await fs.writeFile(filePath, response.data);
      
      // Adicionar ao cache
      this.audioCache.set(cacheKey, filePath);
      
      logger.info(`Áudio TTS gerado com sucesso: ${filePath} (${response.data.byteLength} bytes)`);
      
      return filePath;
    } catch (error) {
      logger.error('Erro ao gerar áudio TTS:', error.message);
      
      if (error.response) {
        logger.error('Status HTTP:', error.response.status);
        logger.error('Dados do erro:', JSON.stringify(error.response.data));
        
        if (error.response.status === 400) {
          throw new Error('Texto inválido para geração de áudio');
        } else if (error.response.status === 401) {
          throw new Error('Erro de autenticação OpenAI - verifique API key');
        } else if (error.response.status === 429) {
          throw new Error('Limite de rate da API OpenAI excedido');
        } else if (error.response.status === 500) {
          throw new Error('Erro interno da API OpenAI');
        }
      }
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('Timeout na geração de áudio - tente com texto menor');
      }
      
      throw new Error(`Falha na geração de áudio: ${error.message}`);
    }
  }

  /**
   * Remove arquivos temporários antigos (mais de 1 hora)
   */
  async cleanupOldTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hora
      let removedCount = 0;

      for (const file of files) {
        if (file.startsWith('tts_')) {
          const filePath = path.join(this.tempDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.remove(filePath);
            removedCount++;
            
            // Remover do cache também
            for (const [key, cachedPath] of this.audioCache.entries()) {
              if (cachedPath === filePath) {
                this.audioCache.delete(key);
                break;
              }
            }
          }
        }
      }

      if (removedCount > 0) {
        logger.info(`Limpeza TTS: ${removedCount} arquivos temporários removidos`);
      }
    } catch (error) {
      logger.warn('Erro na limpeza de arquivos temporários TTS:', error.message);
    }
  }

  /**
   * Remove arquivo específico
   */
  async removeFile(filePath) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        
        // Remover do cache
        for (const [key, cachedPath] of this.audioCache.entries()) {
          if (cachedPath === filePath) {
            this.audioCache.delete(key);
            break;
          }
        }
        
        logger.info('Arquivo TTS removido:', filePath);
      }
    } catch (error) {
      logger.warn('Erro ao remover arquivo TTS:', error.message);
    }
  }

  /**
   * Verifica se o serviço está configurado corretamente
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Estatísticas do cache
   */
  getCacheStats() {
    return {
      cacheSize: this.audioCache.size,
      tempDir: this.tempDir
    };
  }
}

module.exports = TextToSpeechService;
