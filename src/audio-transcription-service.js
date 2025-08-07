const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');
const logger = require('./logger');

class AudioTranscriptionService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.ffmpegAvailable = false;
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY deve estar definida no arquivo .env');
    }
    
    // Criar diretório temporário se não existir
    this.initTempDirectory();
    
    // Verificar disponibilidade do FFmpeg
    this.checkFFmpegAvailability();
  }

  /**
   * Verifica se FFmpeg está disponível no sistema
   */
  async checkFFmpegAvailability() {
    try {
      await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(__filename, (error) => {
          // Se der erro de arquivo não encontrado, mas o FFmpeg responder, está OK
          if (error && error.message.includes('Invalid data found when processing input')) {
            resolve(true);
          } else if (error && (error.message.includes('spawn') && error.message.includes('ENOENT'))) {
            reject(new Error('FFmpeg não encontrado'));
          } else if (error) {
            logger.debug('FFmpeg probe error:', error.message);
            reject(new Error('FFmpeg não encontrado'));
          } else {
            resolve(true);
          }
        });
      });
      
      this.ffmpegAvailable = true;
      logger.info('FFmpeg disponível no sistema');
    } catch (error) {
      this.ffmpegAvailable = false;
      logger.warn('FFmpeg não encontrado no sistema. Transcrição de áudios não funcionará.');
      logger.warn('Para usar transcrição de áudios, instale o FFmpeg:');
      logger.warn('- Windows: Baixe de https://github.com/BtbN/FFmpeg-Builds/releases');
      logger.warn('- Extraia para C:\\ffmpeg e adicione C:\\ffmpeg\\bin ao PATH');
      logger.warn('- Linux: sudo apt install ffmpeg');
      logger.warn('- macOS: brew install ffmpeg');
      logger.warn('Consulte install-ffmpeg-windows.md para instruções detalhadas');
    }
  }

  async initTempDirectory() {
    try {
      await fs.ensureDir(this.tempDir);
      logger.info('Diretório temporário criado/verificado:', this.tempDir);
    } catch (error) {
      logger.error('Erro ao criar diretório temporário:', error.message);
    }
  }

  /**
   * Converte arquivo de áudio OGG para MP3 usando FFmpeg
   * @param {string} inputPath - Caminho do arquivo OGG
   * @param {string} outputPath - Caminho do arquivo MP3 de saída
   * @returns {Promise<boolean>} - true se conversão foi bem-sucedida
   */
  async convertOggToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      // Verificar se FFmpeg está disponível
      const command = ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioChannels(1) // Mono para reduzir tamanho
        .audioFrequency(16000) // 16kHz é suficiente para voz
        .audioBitrate('64k') // Bitrate baixo para voz
        .format('mp3')
        .output(outputPath)
        .on('start', (commandLine) => {
          logger.info('FFmpeg iniciado:', commandLine);
        })
        .on('stderr', (stderrLine) => {
          logger.debug('FFmpeg stderr:', stderrLine);
        })
        .on('end', () => {
          logger.info('Conversão de áudio concluída:', outputPath);
          resolve(true);
        })
        .on('error', (error) => {
          logger.error('Erro na conversão de áudio:', error.message);
          logger.error('FFmpeg error stack:', error.stack);
          
          // Verificar se é erro de FFmpeg não encontrado
          if (error.message.includes('spawn') && error.message.includes('ENOENT')) {
            reject(new Error('FFmpeg não encontrado no sistema. Instale o FFmpeg para usar a transcrição de áudios.'));
          } else if (error.message.includes('codec') || error.message.includes('libmp3lame')) {
            reject(new Error('Codec MP3 não disponível no FFmpeg. Verifique a instalação do FFmpeg.'));
          } else {
            reject(error);
          }
        });

      // Configurar timeout para conversão
      setTimeout(() => {
        command.kill('SIGKILL');
        reject(new Error('Timeout na conversão de áudio'));
      }, 30000); // 30 segundos de timeout
      
      command.run();
    });
  }

  /**
   * Transcreve arquivo de áudio usando OpenAI Whisper
   * @param {string} audioFilePath - Caminho do arquivo de áudio MP3
   * @returns {Promise<string>} - Texto transcrito
   */
  async transcribeAudio(audioFilePath) {
    try {
      // Verificar se arquivo existe
      if (!await fs.pathExists(audioFilePath)) {
        throw new Error('Arquivo de áudio não encontrado');
      }

      // Verificar tamanho do arquivo (limite de 25MB da OpenAI)
      const stats = await fs.stat(audioFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 25) {
        throw new Error(`Arquivo muito grande (${fileSizeMB.toFixed(2)}MB). Limite: 25MB`);
      }

      logger.info(`Iniciando transcrição de áudio (${fileSizeMB.toFixed(2)}MB)`);

      // Criar FormData para upload
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt'); // Português
      formData.append('response_format', 'text');

      // Fazer requisição para API da OpenAI
      const response = await axios.post(
        `${this.baseURL}/audio/transcriptions`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          },
          timeout: 60000, // 60 segundos timeout
        }
      );

      const transcription = response.data.trim();
      logger.info('Transcrição concluída:', transcription.substring(0, 100) + '...');
      
      return transcription;
    } catch (error) {
      logger.error('Erro na transcrição:', error.message);
      logger.error('Tipo do erro:', error.constructor.name);
      logger.error('Código do erro:', error.code);
      logger.error('Stack do erro:', error.stack);
      
      if (error.response) {
        logger.error('Status da resposta:', error.response.status);
        logger.error('Dados da resposta:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.status === 400) {
          throw new Error('Formato de áudio não suportado ou arquivo corrompido');
        } else if (error.response.status === 413) {
          throw new Error('Arquivo muito grande. Limite: 25MB');
        } else {
          throw new Error(`Erro da API OpenAI (${error.response.status}): ${error.response.data?.error?.message || error.message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout na transcrição. Tente com um áudio menor');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Erro de conectividade com a API OpenAI. Verifique sua conexão de internet.');
      } else if (error.code === 'EPROTO' || error.code === 'CERT_HAS_EXPIRED') {
        throw new Error('Erro de certificado SSL. Verifique a data/hora do sistema.');
      } else {
        logger.error('Erro sem response - provavelmente rede:', error);
        throw new Error(`Erro de rede na transcrição: ${error.message}`);
      }
    }
  }

  /**
   * Processa arquivo de áudio completo: download, conversão e transcrição
   * @param {Buffer} audioBuffer - Buffer do arquivo de áudio
   * @param {string} originalFilename - Nome original do arquivo
   * @param {number} maxDurationSeconds - Duração máxima permitida em segundos
   * @returns {Promise<string>} - Texto transcrito
   */
  async processAudio(audioBuffer, originalFilename = 'audio', maxDurationSeconds = 30) {
    // Verificar se FFmpeg está disponível
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg não está disponível no sistema. Instale o FFmpeg para usar transcrição de áudios.');
    }

    const timestamp = Date.now();
    const oggPath = path.join(this.tempDir, `${timestamp}_${originalFilename}.ogg`);
    const mp3Path = path.join(this.tempDir, `${timestamp}_${originalFilename}.mp3`);

    try {
      // Salvar buffer como arquivo OGG temporário
      await fs.writeFile(oggPath, audioBuffer);
      logger.info('Arquivo de áudio salvo temporariamente:', oggPath);

      // Verificar duração do áudio antes de converter
      const duration = await this.getAudioDuration(oggPath);
      if (duration > maxDurationSeconds) {
        throw new Error(`Áudio muito longo (${duration}s). Limite: ${maxDurationSeconds}s`);
      }

      // Converter OGG para MP3
      await this.convertOggToMp3(oggPath, mp3Path);

      // Transcrever áudio
      const transcription = await this.transcribeAudio(mp3Path);

      return transcription;
    } catch (error) {
      logger.error('Erro no processamento de áudio:', error.message);
      throw error;
    } finally {
      // Limpar arquivos temporários
      await this.cleanupTempFiles([oggPath, mp3Path]);
    }
  }

  /**
   * Obtém duração do áudio em segundos
   * @param {string} audioPath - Caminho do arquivo de áudio
   * @returns {Promise<number>} - Duração em segundos
   */
  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (error, metadata) => {
        if (error) {
          reject(error);
        } else {
          const duration = metadata.format.duration;
          resolve(Math.round(duration));
        }
      });
    });
  }

  /**
   * Remove arquivos temporários
   * @param {string[]} filePaths - Array de caminhos dos arquivos para remover
   */
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.info('Arquivo temporário removido:', filePath);
        }
      } catch (error) {
        logger.warn('Erro ao remover arquivo temporário:', filePath, error.message);
      }
    }
  }

  /**
   * Limpa arquivos temporários antigos (mais de 1 hora)
   */
  async cleanupOldTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < oneHourAgo) {
          await fs.remove(filePath);
          logger.info('Arquivo temporário antigo removido:', filePath);
        }
      }
    } catch (error) {
      logger.warn('Erro na limpeza de arquivos temporários antigos:', error.message);
    }
  }
}

module.exports = AudioTranscriptionService;
