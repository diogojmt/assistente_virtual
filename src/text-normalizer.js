const logger = require('./logger');

class TextNormalizer {
  constructor() {
    // Padrões para limpeza de números
    this.numberPatterns = {
      // Remove caracteres especiais comuns em números transcritos
      specialChars: /[.,\-\s_]+/g,
      // Detecta sequências que parecem números (incluindo com caracteres especiais)
      numberSequence: /\b\d+[.,\-\s_]*\d*[.,\-\s_]*\d*\b/g,
      // Números com pontos, vírgulas, traços ou espaços
      dirtyNumber: /\b\d+[.,\-\s_\d]*\d+\b/g,
      // CPF/CNPJ patterns (11 ou 14 dígitos, incluindo barra no CNPJ)
      cpfCnpj: /\b\d{1,3}[.,\-\s_]*\d{3}[.,\-\s_]*\d{3}[.,\-\s\/]*\d{2,4}[.,\-\s_]*\d{2}\b/g,
      // Telefone patterns
      phone: /\b\d{1,2}[.,\-\s_]*\d{4,5}[.,\-\s_]*\d{4}\b/g,
      // CEP patterns (8 dígitos)
      cep: /\b\d{2}[.,\-\s_]*\d{3}[.,\-\s_]*\d{3}\b/g
    };
  }

  /**
   * Normaliza texto removendo caracteres especiais de números
   * @param {string} text - Texto a ser normalizado
   * @returns {string} - Texto com números limpos
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let normalizedText = text;
    const originalText = text;

    try {
      // 1. Normalizar CPF/CNPJ (manter apenas dígitos)
      normalizedText = normalizedText.replace(this.numberPatterns.cpfCnpj, (match) => {
        const cleanNumber = match.replace(/[^\d]/g, '');
        logger.debug(`CPF/CNPJ normalizado: "${match}" -> "${cleanNumber}"`);
        return cleanNumber;
      });

      // 2. Normalizar telefones
      normalizedText = normalizedText.replace(this.numberPatterns.phone, (match) => {
        const cleanNumber = match.replace(/[^\d]/g, '');
        logger.debug(`Telefone normalizado: "${match}" -> "${cleanNumber}"`);
        return cleanNumber;
      });

      // 3. Normalizar CEP
      normalizedText = normalizedText.replace(this.numberPatterns.cep, (match) => {
        const cleanNumber = match.replace(/[^\d]/g, '');
        logger.debug(`CEP normalizado: "${match}" -> "${cleanNumber}"`);
        return cleanNumber;
      });

      // 4. Normalizar outras sequências numéricas
      normalizedText = normalizedText.replace(this.numberPatterns.dirtyNumber, (match) => {
        // Preservar números decimais legítimos (ex: 123.45)
        if (this.isValidDecimal(match)) {
          return match;
        }
        
        const cleanNumber = match.replace(/[^\d]/g, '');
        // Só normalizar se tiver mais de 4 dígitos (provavelmente documento/código)
        if (cleanNumber.length > 4) {
          logger.debug(`Número normalizado: "${match}" -> "${cleanNumber}"`);
          return cleanNumber;
        }
        return match;
      });

      // Log apenas se houve mudanças significativas
      if (originalText !== normalizedText) {
        logger.info(`Texto normalizado: "${originalText}" -> "${normalizedText}"`);
      }

      return normalizedText;

    } catch (error) {
      logger.error('Erro na normalização do texto:', error.message);
      return originalText; // Retorna texto original em caso de erro
    }
  }

  /**
   * Verifica se um número com pontos/vírgulas é um decimal válido
   * @param {string} numberStr - String do número
   * @returns {boolean} - true se for decimal válido
   */
  isValidDecimal(numberStr) {
    // Aceitar formatos como: 123.45, 123,45, 1.234,56, 1,234.56
    const decimalPatterns = [
      /^\d+\.\d{1,2}$/, // 123.45
      /^\d+,\d{1,2}$/, // 123,45
      /^\d{1,3}(\.\d{3})*,\d{1,2}$/, // 1.234,56
      /^\d{1,3}(,\d{3})*\.\d{1,2}$/ // 1,234.56
    ];

    return decimalPatterns.some(pattern => pattern.test(numberStr.trim()));
  }

  /**
   * Normaliza especificamente para consultas de débitos
   * @param {string} text - Texto com possível CPF/CNPJ
   * @returns {string} - Texto normalizado para consulta
   */
  normalizeForDebitQuery(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let normalized = text;

    // Extrair e limpar números que parecem documentos
    const documentPattern = /\b\d+[.,\-\s_\d]*\d+\b/g;
    normalized = normalized.replace(documentPattern, (match) => {
      const cleanNumber = match.replace(/[^\d]/g, '');
      
      // Se for CPF (11 dígitos) ou CNPJ (14 dígitos), limpar completamente
      if (cleanNumber.length === 11 || cleanNumber.length === 14) {
        logger.info(`Documento normalizado para consulta: "${match}" -> "${cleanNumber}"`);
        return cleanNumber;
      }
      
      return match;
    });

    return normalized;
  }

  /**
   * Normaliza texto especificamente para consultas de pertences
   * @param {string} text - Texto a ser normalizado
   * @returns {string} - Texto normalizado
   */
  normalizeForBelongingsQuery(text) {
    // Para pertences, focar em números de protocolo, RG, etc.
    return this.normalizeText(text);
  }

  /**
   * Detecta se o texto contém números que precisam ser normalizados
   * @param {string} text - Texto a verificar
   * @returns {boolean} - true se contém números que precisam limpeza
   */
  needsNormalization(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // Verifica se há números com caracteres especiais
    return this.numberPatterns.dirtyNumber.test(text) || 
           this.numberPatterns.cpfCnpj.test(text) ||
           this.numberPatterns.phone.test(text) ||
           this.numberPatterns.cep.test(text);
  }

  /**
   * Mostra exemplo de normalização para teste
   */
  showNormalizationExample() {
    const examples = [
      "Meu CPF é 123.456.789-01",
      "O telefone é 11 9-8765-4321",
      "CEP: 01234-567",
      "Protocolo número 2023.12.345.678",
      "RG: 12-345-678-9"
    ];

    logger.info('=== Exemplos de Normalização ===');
    examples.forEach(example => {
      const normalized = this.normalizeText(example);
      logger.info(`"${example}" -> "${normalized}"`);
    });
    logger.info('================================');
  }
}

module.exports = TextNormalizer;
