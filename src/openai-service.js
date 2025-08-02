const axios = require('axios');
const logger = require('./logger');
const { consultarPertences } = require('./consultaPertences');
const { consultarDebitos, formatarRespostaDebitos, TIPO_CONTRIBUINTE } = require('./debitosService');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.assistantId = process.env.OPENAI_ASSISTANT_ID;
    this.baseURL = 'https://api.openai.com/v1';
    this.userThreads = new Map(); // Manter threads por usuário
    
    if (!this.apiKey || !this.assistantId) {
      throw new Error('OPENAI_API_KEY e OPENAI_ASSISTANT_ID devem estar definidos no arquivo .env');
    }
  }

  async createThread() {
    try {
      
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
      const maxAttempts = 120; // 120 segundos máximo para consultas grandes
      
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
        
        logger.info(`Run ${runId} status: ${status} (tentativa ${attempts}/${maxAttempts})`);
        
        // Tratar function calling
        if (status === 'requires_action') {
          logger.info('Run requer ação - executando function calling...');
          await this.handleRequiredAction(threadId, runId, response.data);
          // Reset attempts counter after handling action since this is expected
          attempts = 0;
          continue;
        }
        
        if (status === 'failed') {
          const errorDetails = response.data.last_error || 'Erro desconhecido';
          logger.error(`Run falhou: ${JSON.stringify(errorDetails)}`);
          throw new Error(`Run falhou: ${errorDetails.message || errorDetails}`);
        }
        
        if (status === 'cancelled' || status === 'expired') {
          throw new Error(`Run foi ${status}`);
        }
      }
      
      if (status !== 'completed') {
        logger.error(`Timeout após ${maxAttempts} segundos. Status final: ${status}`);
        throw new Error(`Timeout aguardando conclusão do run. Status: ${status}`);
      }
      
      logger.info(`Run ${runId} completado com sucesso`);
      return true;
    } catch (error) {
      logger.error('Erro ao aguardar conclusão do run:', error.message);
      logger.error('Stack trace:', error.stack);
      throw error;
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
          case 'encerrar_atendimento':
            output = await this.executarEncerramentoAtendimento(functionArgs);
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
      
      // Limpar CNPJ/CPF (remover pontos, traços e barras)
      const documentoLimpo = cpf_cnpj.replace(/[^\d]/g, '');
      
      const resultado = await consultarPertences(documentoLimpo);
      
      if (resultado.sucesso) {
        // Para consultas com muitos resultados, criar resumo
        let dados = resultado.dados;
        if (resultado.dadosEstruturados && resultado.dadosEstruturados[0]) {
          const contribuinte = resultado.dadosEstruturados[0];
          const qtdImoveis = contribuinte.SDTRetornoPertencesImovel ? contribuinte.SDTRetornoPertencesImovel.length : 0;
          const qtdEmpresas = contribuinte.SDTRetornoPertencesEmpresa ? contribuinte.SDTRetornoPertencesEmpresa.length : 0;
          
          // Se tem muitos imóveis, criar resposta resumida
          if (qtdImoveis > 100) {
            dados = `👤 **Nome:** ${contribuinte.SRPNomeContribuinte}\n` +
                   `📄 **Documento:** ${contribuinte.SRPCPFCNPJContribuinte}\n` +
                   `🏢 **Empresas:** ${qtdEmpresas}\n` +
                   `🏠 **Imóveis:** ${qtdImoveis}\n\n` +
                   `⚠️ Este contribuinte possui um grande número de imóveis (${qtdImoveis}). ` +
                   `Para consultas específicas, informe a inscrição do imóvel desejado ou ` +
                   `procure a Secretaria Municipal da Fazenda.`;
          }
        }
        
        return JSON.stringify({
          sucesso: true,
          dados: dados,
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

  async executarEncerramentoAtendimento(args) {
    try {
      const { usuario_id } = args;
      logger.info(`Encerrando atendimento para usuário: ${usuario_id}`);
      
      // Limpar thread do usuário se fornecido
      if (usuario_id && this.userThreads.has(usuario_id)) {
        this.clearUserThread(usuario_id);
      }
      
      return JSON.stringify({
        sucesso: true,
        mensagem: 'Atendimento encerrado com sucesso'
      });
    } catch (error) {
      logger.error('Erro ao encerrar atendimento:', error.message);
      return JSON.stringify({
        sucesso: false,
        erro: 'Erro interno ao encerrar atendimento'
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

  async processMessage(message, userId = 'default') {
    let threadId = null;
    try {
      logger.info(`Processando mensagem para usuário ${userId}: "${message}"`);
      
      // Obter ou criar thread para o usuário
      threadId = this.userThreads.get(userId);
      if (!threadId) {
        logger.info('Criando nova thread...');
        threadId = await this.createThread();
        this.userThreads.set(userId, threadId);
        logger.info(`Nova thread criada para usuário ${userId}: ${threadId}`);
      } else {
        logger.info(`Usando thread existente para usuário ${userId}: ${threadId}`);
      }
      
      // Adicionar mensagem à thread
      logger.info('Adicionando mensagem à thread...');
      await this.addMessageToThread(threadId, message);
      
      // Executar assistant
      logger.info('Iniciando run da thread...');
      const runId = await this.runThread(threadId);
      
      // Aguardar conclusão
      logger.info('Aguardando conclusão do run...');
      await this.waitForRunCompletion(threadId, runId);
      
      // Buscar resposta
      logger.info('Buscando mensagens da thread...');
      const messages = await this.getThreadMessages(threadId);
      
      // A resposta mais recente será a primeira no array
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content || !assistantMessage.content[0]) {
        logger.error('Resposta do assistant não encontrada nas mensagens:', messages);
        throw new Error('Resposta do assistant não encontrada');
      }
      
      const responseText = assistantMessage.content[0].text.value;
      logger.info(`Resposta da OpenAI obtida: "${responseText.substring(0, 100)}..."`);
      
      return responseText;
    } catch (error) {
      logger.error('Erro no processamento da mensagem:', error.message);
      logger.error('Stack trace completo:', error.stack);
      
      // Se a thread falhou, limpar e tentar criar nova
      if (error.message.includes('thread') || error.message.includes('run') || error.message.includes('Timeout')) {
        logger.warn(`Thread ${threadId} falhou, limpando para usuário ${userId}`);
        this.clearUserThread(userId);
      }
      
      throw error;
    }
  }

  // Método para limpar thread de um usuário (opcional)
  clearUserThread(userId) {
    this.userThreads.delete(userId);
    logger.info(`Thread do usuário ${userId} removida`);
  }
}

module.exports = OpenAIService;
