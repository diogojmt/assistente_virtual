require('dotenv').config();
const WhatsAppBot = require('./src/whatsapp-bot');
const logger = require('./src/logger');

// Validar variáveis de ambiente obrigatórias
function validateEnvironment() {
  const requiredVars = ['OPENAI_API_KEY', 'OPENAI_ASSISTANT_ID'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error(`Variáveis de ambiente obrigatórias não encontradas: ${missingVars.join(', ')}`);
    logger.error('Por favor, configure essas variáveis no arquivo .env');
    process.exit(1);
  }
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Tratamento de sinais de sistema (para Replit e outros ambientes)
process.on('SIGINT', () => {
  logger.info('Recebido SIGINT. Encerrando bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM. Encerrando bot...');
  process.exit(0);
});

// Função principal
async function main() {
  try {
    logger.info('=== Bot WhatsApp + OpenAI ===');
    logger.info('Versão: 1.0.0');
    logger.info('Ambiente: ' + (process.env.NODE_ENV || 'development'));
    
    // Validar configuração
    validateEnvironment();
    
    // Criar e iniciar bot
    const bot = new WhatsAppBot();
    await bot.start();
    
    // Manter processo ativo para Replit
    const port = process.env.PORT || 3000;
    const express = require('express');
    const app = express();
    
    app.get('/', (req, res) => {
      res.json({ 
        status: 'Bot ativo',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    app.listen(port, () => {
      logger.info(`Servidor HTTP ativo na porta ${port} (para compatibilidade com Replit)`);
    });
    
  } catch (error) {
    logger.error('Erro fatal:', error.message);
    process.exit(1);
  }
}

// Iniciar aplicação
main();
