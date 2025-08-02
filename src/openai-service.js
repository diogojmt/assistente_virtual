const axios = require('axios');
const logger = require('./logger');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.assistantId = process.env.OPENAI_ASSISTANT_ID;
    this.baseURL = 'https://api.openai.com/v1';
    
    if (!this.apiKey || !this.assistantId) {
      throw new Error('OPENAI_API_KEY e OPENAI_ASSISTANT_ID devem estar definidos no arquivo .env');
    }
  }

  async createThread() {
    try {
      console.log('DEBUG - Iniciando criação de thread...');
      console.log('DEBUG - API Key:', this.apiKey ? `${this.apiKey.substring(0, 20)}...` : 'UNDEFINED');
      console.log('DEBUG - Assistant ID:', this.assistantId || 'UNDEFINED');
      console.log('DEBUG - Base URL:', this.baseURL || 'UNDEFINED');
      
      const response = await axios.post(
        `${this.baseURL}/threads`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );
      
      logger.info(`Thread criada: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      console.log('DEBUG - Erro ao criar thread:');
      console.log('DEBUG - Tipo do erro:', typeof error);
      console.log('DEBUG - Error message:', error.message);
      console.log('DEBUG - Error stack:', error.stack);
      console.log('DEBUG - Status:', error.response?.status);
      console.log('DEBUG - Response data:', error.response?.data);
      
      if (error.code) {
        console.log('DEBUG - Error code:', error.code);
      }
      
      throw new Error(`Falha ao criar thread da OpenAI: ${error.response?.data?.error?.message || error.message || 'Erro desconhecido'}`);
    }
  }

  async addMessageToThread(threadId, message) {
    try {
      const response = await axios.post(
        `${this.baseURL}/threads/${threadId}/messages`,
        {
          role: 'user',
          content: message
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );
      
      logger.info(`Mensagem adicionada à thread ${threadId}`);
      return response.data;
    } catch (error) {
      logger.error('Erro ao adicionar mensagem à thread:', error.response?.data || error.message);
      throw new Error('Falha ao adicionar mensagem à thread');
    }
  }

  async runThread(threadId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/threads/${threadId}/runs`,
        {
          assistant_id: this.assistantId
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );
      
      logger.info(`Run iniciado para thread ${threadId}: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      logger.error('Erro ao executar thread:', error.response?.data || error.message);
      throw new Error('Falha ao executar thread');
    }
  }

  async waitForRunCompletion(threadId, runId) {
    try {
      let status = 'queued';
      let attempts = 0;
      const maxAttempts = 30; // 30 segundos máximo
      
      while (status !== 'completed' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Aguarda 1 segundo
        
        const response = await axios.get(
          `${this.baseURL}/threads/${threadId}/runs/${runId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'OpenAI-Beta': 'assistants=v2'
            }
          }
        );
        
        status = response.data.status;
        attempts++;
        
        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
          throw new Error(`Run falhou com status: ${status}`);
        }
      }
      
      if (status !== 'completed') {
        throw new Error('Timeout aguardando conclusão do run');
      }
      
      logger.info(`Run ${runId} completado com sucesso`);
      return true;
    } catch (error) {
      logger.error('Erro ao aguardar conclusão do run:', error.message);
      throw new Error('Falha ao aguardar resposta da OpenAI');
    }
  }

  async getThreadMessages(threadId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/threads/${threadId}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );
      
      return response.data.data;
    } catch (error) {
      logger.error('Erro ao buscar mensagens da thread:', error.response?.data || error.message);
      throw new Error('Falha ao buscar mensagens da thread');
    }
  }

  async processMessage(message) {
    try {
      logger.info(`Processando mensagem: "${message}"`);
      
      // Criar nova thread para cada mensagem
      const threadId = await this.createThread();
      
      // Adicionar mensagem à thread
      await this.addMessageToThread(threadId, message);
      
      // Executar assistant
      const runId = await this.runThread(threadId);
      
      // Aguardar conclusão
      await this.waitForRunCompletion(threadId, runId);
      
      // Buscar resposta
      const messages = await this.getThreadMessages(threadId);
      
      // A resposta mais recente será a primeira no array
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content || !assistantMessage.content[0]) {
        throw new Error('Resposta do assistant não encontrada');
      }
      
      const responseText = assistantMessage.content[0].text.value;
      logger.info(`Resposta da OpenAI obtida: "${responseText.substring(0, 100)}..."`);
      
      return responseText;
    } catch (error) {
      logger.error('Erro no processamento da mensagem:', error.message);
      throw error;
    }
  }
}

module.exports = OpenAIService;
