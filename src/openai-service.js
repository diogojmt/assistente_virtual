const axios = require('axios');
const logger = require('./logger');
const { consultarPertences } = require('./consultaPertences');
const { consultarDebitos, formatarRespostaDebitos, TIPO_CONTRIBUINTE } = require('./debitosService');

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
        
        // Tratar function calling
        if (status === 'requires_action') {
          await this.handleRequiredAction(threadId, runId, response.data);
          continue; // Continua o loop para aguardar a conclusão
        }
        
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

  async handleRequiredAction(threadId, runId, runData) {
    try {
      const toolCalls = runData.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = [];

      for (const toolCall of toolCalls) {
        logger.info(`Executando função: ${toolCall.function.name}`);
        
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        let output = '';
        
        switch (functionName) {
          case 'consultar_pertences':
            output = await this.executarConsultaPertences(functionArgs);
            break;
          case 'consultar_debitos':
            output = await this.executarConsultaDebitos(functionArgs);
            break;
          default:
            output = JSON.stringify({ erro: 'Função não encontrada' });
        }
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: output
        });
      }

      // Submeter os resultados das funções
      await axios.post(
        `${this.baseURL}/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
        { tool_outputs: toolOutputs },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );
      
      logger.info('Tool outputs submetidos com sucesso');
    } catch (error) {
      logger.error('Erro ao tratar required action:', error.message);
      throw error;
    }
  }

  async executarConsultaPertences(args) {
    try {
      const { cpf_cnpj } = args;
      logger.info(`Executando consulta de pertences para: ${cpf_cnpj}`);
      
      const resultado = await consultarPertences(cpf_cnpj);
      
      if (resultado.sucesso) {
        return JSON.stringify({
          sucesso: true,
          dados: resultado.dados,
          dadosEstruturados: resultado.dadosEstruturados
        });
      } else {
        return JSON.stringify({
          sucesso: false,
          erro: resultado.erro
        });
      }
    } catch (error) {
      logger.error('Erro na execução de consulta de pertences:', error.message);
      return JSON.stringify({
        sucesso: false,
        erro: 'Erro interno na consulta de pertences'
      });
    }
  }

  async executarConsultaDebitos(args) {
    try {
      const { tipo_contribuinte, inscricao, exercicio = '2025' } = args;
      logger.info(`Executando consulta de débitos - Tipo: ${tipo_contribuinte}, Inscrição: ${inscricao}`);
      
      const resultado = await consultarDebitos(tipo_contribuinte, inscricao, exercicio);
      
      if (resultado.sucesso) {
        const respostaFormatada = formatarRespostaDebitos(resultado.dados);
        return JSON.stringify({
          sucesso: true,
          resposta: respostaFormatada,
          dados: resultado.dados
        });
      } else {
        return JSON.stringify({
          sucesso: false,
          erro: resultado.erro
        });
      }
    } catch (error) {
      logger.error('Erro na execução de consulta de débitos:', error.message);
      return JSON.stringify({
        sucesso: false,
        erro: 'Erro interno na consulta de débitos'
      });
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
