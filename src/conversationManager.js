const logger = require('./logger');
const { consultarPertences, validarCpfCnpj } = require('./consultaPertences');
const { consultarDebitos, formatarRespostaDebitos, obterInscricoesPertences, TIPO_CONTRIBUINTE } = require('./debitosService');

// Estados da conversa para cada usuário
const conversationStates = new Map();

// Tipos de consulta
const CONSULTA_TIPOS = {
  DEBITOS_GERAL: 'debitos_geral',
  DEBITOS_IMOVEL: 'debitos_imovel', 
  DEBITOS_EMPRESA: 'debitos_empresa',
  PERTENCES: 'pertences'
};

// Estados da conversa
const ESTADOS = {
  INICIAL: 'inicial',
  AGUARDANDO_CPF_CNPJ: 'aguardando_cpf_cnpj',
  AGUARDANDO_INSCRICAO: 'aguardando_inscricao',
  SELECIONANDO_IMOVEL: 'selecionando_imovel',
  SELECIONANDO_EMPRESA: 'selecionando_empresa',
  PROCESSANDO: 'processando'
};

function detectarIntencao(mensagem) {
  const msg = mensagem.toLowerCase().trim();
  
  // Detectar saudações e encerramentos
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eai)/i.test(msg)) {
    return { tipo: 'saudacao' };
  }
  
  if (/^(obrigad|obrigada|valeu|vlw|tchau|até|encerr)/i.test(msg)) {
    return { tipo: 'encerramento' };
  }
  
  // Detectar seleção numérica simples (1, 2, 3, etc.)
  if (/^\d{1,2}$/.test(msg.trim())) {
    return {
      tipo: 'selecao_numerica',
      numero: parseInt(msg.trim())
    };
  }
  
  // Detectar CPF/CNPJ na mensagem
  const documentoMatch = msg.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{11}|\d{14}/);
  
  // Detectar inscrição imobiliária/municipal (números entre 4 e 15 dígitos)
  const inscricaoMatch = msg.match(/\b\d{4,15}\b/);
  
  // Detectar solicitações de débitos
  if (/d[eé]bit|deve|devo|pag|cobr|iptu|iss|cosip|taxa/i.test(msg)) {
    if (/im[oó]vel|casa|terreno|lote|apartamento|iptu/i.test(msg)) {
      return {
        tipo: CONSULTA_TIPOS.DEBITOS_IMOVEL,
        documento: documentoMatch ? documentoMatch[0] : null,
        inscricao: inscricaoMatch && !documentoMatch ? inscricaoMatch[0] : null
      };
    } else if (/empresa|cnpj|negócio|neg[oó]cio|iss|firma/i.test(msg)) {
      return {
        tipo: CONSULTA_TIPOS.DEBITOS_EMPRESA,
        documento: documentoMatch ? documentoMatch[0] : null
      };
    } else {
      return {
        tipo: CONSULTA_TIPOS.DEBITOS_GERAL,
        documento: documentoMatch ? documentoMatch[0] : null
      };
    }
  }
  
  // Detectar consultas de pertences/vínculos
  if (/pert|v[ií]ncul|propried|possui|tem|empresa|im[oó]vel|nome/i.test(msg)) {
    return {
      tipo: CONSULTA_TIPOS.PERTENCES,
      documento: documentoMatch ? documentoMatch[0] : null
    };
  }
  
  // Se apenas CPF/CNPJ foi enviado
  if (documentoMatch && msg.length <= 20) {
    return {
      tipo: 'documento',
      documento: documentoMatch[0]
    };
  }
  
  // Se apenas número (possível inscrição) - mas não CPF/CNPJ
  if (inscricaoMatch && !documentoMatch && msg.length <= 20) {
    return {
      tipo: 'inscricao',
      inscricao: inscricaoMatch[0]
    };
  }
  
  return { tipo: 'desconhecido' };
}

function obterEstadoUsuario(userId) {
  if (!conversationStates.has(userId)) {
    conversationStates.set(userId, {
      estado: ESTADOS.INICIAL,
      tipoConsulta: null,
      documento: null,
      inscricao: null,
      dadosPertences: null,
      opcoes: null
    });
  }
  return conversationStates.get(userId);
}

function atualizarEstadoUsuario(userId, novoEstado) {
  const estadoAtual = obterEstadoUsuario(userId);
  conversationStates.set(userId, { ...estadoAtual, ...novoEstado });
}

function limparEstadoUsuario(userId) {
  conversationStates.delete(userId);
}

function formatarOpcoesImoveis(imoveis) {
  let resposta = '🏠 **Imóveis vinculados ao seu CPF/CNPJ:**\n\n';
  
  imoveis.forEach((imovel, index) => {
    resposta += `${index + 1}. 🏷️ **${imovel.inscricao}**\n`;
    if (imovel.endereco) {
      resposta += `   📍 ${imovel.endereco}\n`;
    }
    if (imovel.tipo) {
      resposta += `   🏠 Tipo: ${imovel.tipo}\n`;
    }
    resposta += '\n';
  });
  
  resposta += 'Digite o número do imóvel para consultar os débitos ou envie a inscrição diretamente.';
  return resposta;
}

function formatarOpcoesEmpresas(empresas) {
  let resposta = '🏢 **Empresas vinculadas ao seu CPF/CNPJ:**\n\n';
  
  empresas.forEach((empresa, index) => {
    resposta += `${index + 1}. 🏷️ **${empresa.inscricao}**\n`;
    if (empresa.endereco) {
      resposta += `   📍 ${empresa.endereco}\n`;
    }
    if (empresa.tipo) {
      resposta += `   🏢 ${empresa.tipo}\n`;
    }
    resposta += '\n';
  });
  
  resposta += 'Digite o número da empresa para consultar os débitos ou envie a inscrição diretamente.';
  return resposta;
}

async function processarMensagem(userId, mensagem) {
  try {
    const estado = obterEstadoUsuario(userId);
    const intencao = detectarIntencao(mensagem);
    
    logger.info(`Processando mensagem do usuário ${userId}: ${intencao.tipo}`);
    
    // Tratar saudações
    if (intencao.tipo === 'saudacao') {
      return 'Olá! 👋 Sou o assistente virtual da Secretaria Municipal da Fazenda de Arapiraca.\n\n' +
             'Posso ajudá-lo com:\n' +
             '• 💰 Consulta de débitos municipais\n' +
             '• 🏠 Débitos de imóveis (IPTU, taxas)\n' +
             '• 🏢 Débitos de empresas (ISS, taxas)\n' +
             '• 🔍 Consulta de vínculos e pertences\n\n' +
             'Como posso ajudá-lo hoje?';
    }
    
    // Tratar encerramentos
    if (intencao.tipo === 'encerramento') {
      limparEstadoUsuario(userId);
      return 'Obrigado por utilizar nossos serviços! 😊\n\n' +
             'Secretaria Municipal da Fazenda de Arapiraca está sempre à disposição.\n\n' +
             'Tenha um ótimo dia! 👋';
    }
    
    // Processar baseado no estado atual
    switch (estado.estado) {
      case ESTADOS.INICIAL:
        return await processarEstadoInicial(userId, intencao);
        
      case ESTADOS.AGUARDANDO_CPF_CNPJ:
        return await processarCpfCnpj(userId, intencao);
        
      case ESTADOS.SELECIONANDO_IMOVEL:
        return await processarSelecaoImovel(userId, intencao);
        
      case ESTADOS.SELECIONANDO_EMPRESA:
        return await processarSelecaoEmpresa(userId, intencao);
        
      case ESTADOS.AGUARDANDO_INSCRICAO:
        return await processarInscricao(userId, intencao);
        
      default:
        return 'Desculpe, ocorreu um erro no atendimento. Vamos recomeçar.\n\nComo posso ajudá-lo?';
    }
    
  } catch (error) {
    logger.error('Erro ao processar mensagem:', error);
    limparEstadoUsuario(userId);
    return 'Desculpe, ocorreu um erro interno. Tente novamente em alguns minutos.';
  }
}

async function processarEstadoInicial(userId, intencao) {
  switch (intencao.tipo) {
    case CONSULTA_TIPOS.DEBITOS_GERAL:
      if (intencao.documento) {
        return await processarConsultaDebitosGeral(userId, intencao.documento);
      } else {
        atualizarEstadoUsuario(userId, {
          estado: ESTADOS.AGUARDANDO_CPF_CNPJ,
          tipoConsulta: CONSULTA_TIPOS.DEBITOS_GERAL
        });
        return 'Para consultar seus débitos, preciso do seu CPF ou CNPJ. Por favor, me informe:';
      }
      
    case CONSULTA_TIPOS.DEBITOS_IMOVEL:
      if (intencao.inscricao) {
        return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.IMOVEL, intencao.inscricao);
      } else if (intencao.documento) {
        return await processarConsultaDebitosImovel(userId, intencao.documento);
      } else {
        atualizarEstadoUsuario(userId, {
          estado: ESTADOS.AGUARDANDO_CPF_CNPJ,
          tipoConsulta: CONSULTA_TIPOS.DEBITOS_IMOVEL
        });
        return 'Para consultar débitos de imóvel, preciso do seu CPF/CNPJ (para listar seus imóveis) ou da inscrição imobiliária diretamente.\n\nPor favor, me informe:';
      }
      
    case CONSULTA_TIPOS.DEBITOS_EMPRESA:
      if (intencao.documento) {
        return await processarConsultaDebitosEmpresa(userId, intencao.documento);
      } else {
        atualizarEstadoUsuario(userId, {
          estado: ESTADOS.AGUARDANDO_CPF_CNPJ,
          tipoConsulta: CONSULTA_TIPOS.DEBITOS_EMPRESA
        });
        return 'Para consultar débitos de empresa, preciso do seu CPF/CNPJ. Por favor, me informe:';
      }
      
    case CONSULTA_TIPOS.PERTENCES:
      if (intencao.documento) {
        return await processarConsultaPertences(userId, intencao.documento);
      } else {
        atualizarEstadoUsuario(userId, {
          estado: ESTADOS.AGUARDANDO_CPF_CNPJ,
          tipoConsulta: CONSULTA_TIPOS.PERTENCES
        });
        return 'Para consultar seus vínculos, preciso do seu CPF ou CNPJ. Por favor, me informe:';
      }
      
    case 'documento':
      return await processarDocumentoGenerico(userId, intencao.documento);
      
    case 'inscricao':
      atualizarEstadoUsuario(userId, {
        estado: ESTADOS.AGUARDANDO_INSCRICAO,
        inscricao: intencao.inscricao
      });
      return `Recebi a inscrição ${intencao.inscricao}.\n\nEsta é uma inscrição de:\n1. 🏠 Imóvel\n2. 🏢 Empresa\n\nDigite 1 ou 2:`;
      
    default:
      return 'Olá! Posso ajudá-lo com consultas de débitos municipais.\n\n' +
             'Exemplos do que posso fazer:\n' +
             '• "Quero ver meus débitos"\n' +
             '• "Tem débito no imóvel 123456?"\n' +
             '• "Débitos da minha empresa"\n' +
             '• "Vínculos do CPF 12345678901"\n\n' +
             'Como posso ajudá-lo?';
  }
}

async function processarCpfCnpj(userId, intencao) {
  const estado = obterEstadoUsuario(userId);
  
  if (intencao.documento) {
    if (!validarCpfCnpj(intencao.documento)) {
      return 'CPF ou CNPJ inválido. Por favor, verifique o número e tente novamente.';
    }
    
    switch (estado.tipoConsulta) {
      case CONSULTA_TIPOS.DEBITOS_GERAL:
        return await processarConsultaDebitosGeral(userId, intencao.documento);
      case CONSULTA_TIPOS.DEBITOS_IMOVEL:
        return await processarConsultaDebitosImovel(userId, intencao.documento);
      case CONSULTA_TIPOS.DEBITOS_EMPRESA:
        return await processarConsultaDebitosEmpresa(userId, intencao.documento);
      case CONSULTA_TIPOS.PERTENCES:
        return await processarConsultaPertences(userId, intencao.documento);
    }
  }
  
  return 'Por favor, me informe um CPF ou CNPJ válido:';
}

async function processarSelecaoImovel(userId, intencao) {
  const estado = obterEstadoUsuario(userId);
  
  if (intencao.tipo === 'selecao_numerica') {
    const opcao = intencao.numero;
    if (opcao > 0 && opcao <= estado.opcoes.length) {
      const imovelSelecionado = estado.opcoes[opcao - 1];
      limparEstadoUsuario(userId);
      return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.IMOVEL, imovelSelecionado.inscricao);
    }
  }
  
  // Verificar se é uma inscrição direta
  if (intencao.inscricao) {
    limparEstadoUsuario(userId);
    return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.IMOVEL, intencao.inscricao);
  }
  
  return 'Por favor, digite o número do imóvel da lista ou a inscrição imobiliária:';
}

async function processarSelecaoEmpresa(userId, intencao) {
  const estado = obterEstadoUsuario(userId);
  
  if (intencao.tipo === 'selecao_numerica') {
    const opcao = intencao.numero;
    if (opcao > 0 && opcao <= estado.opcoes.length) {
      const empresaSelecionada = estado.opcoes[opcao - 1];
      limparEstadoUsuario(userId);
      return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.EMPRESA, empresaSelecionada.inscricao);
    }
  }
  
  // Verificar se é uma inscrição direta
  if (intencao.inscricao) {
    limparEstadoUsuario(userId);
    return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.EMPRESA, intencao.inscricao);
  }
  
  return 'Por favor, digite o número da empresa da lista ou a inscrição municipal:';
}

async function processarInscricao(userId, intencao) {
  const estado = obterEstadoUsuario(userId);
  
  // Se tem inscrição definida (vinda de detecção anterior)
  if (estado.inscricao) {
    const opcao = intencao.tipo === 'selecao_numerica' ? intencao.numero : parseInt(intencao.mensagem?.trim() || '0');
    
    if (opcao === 1) {
      limparEstadoUsuario(userId);
      return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.IMOVEL, estado.inscricao);
    } else if (opcao === 2) {
      limparEstadoUsuario(userId);
      return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.EMPRESA, estado.inscricao);
    }
    
    return 'Por favor, digite 1 para imóvel ou 2 para empresa:';
  }
  
  // Se tem documento e está selecionando opção do menu
  if (estado.documento && intencao.tipo === 'selecao_numerica') {
    const opcao = intencao.numero;
    
    switch (opcao) {
      case 1:
        return await processarConsultaDebitosGeral(userId, estado.documento);
      case 2:
        return await processarConsultaDebitosImovel(userId, estado.documento);
      case 3:
        return await processarConsultaDebitosEmpresa(userId, estado.documento);
      case 4:
        return await processarConsultaPertences(userId, estado.documento);
      default:
        return 'Por favor, digite um número de 1 a 4 ou descreva o que precisa:';
    }
  }
  
  return 'Por favor, escolha uma opção válida:';
}

async function processarDocumentoGenerico(userId, documento) {
  if (!validarCpfCnpj(documento)) {
    return 'CPF ou CNPJ inválido. Por favor, verifique o número.';
  }
  
  atualizarEstadoUsuario(userId, {
    estado: ESTADOS.AGUARDANDO_INSCRICAO,
    documento: documento
  });
  
  return 'Recebi seu CPF/CNPJ. O que você gostaria de consultar?\n\n' +
         '1. 💰 Todos os débitos em meu nome\n' +
         '2. 🏠 Débitos de imóveis\n' +
         '3. 🏢 Débitos de empresas\n' +
         '4. 🔍 Vínculos e pertences\n\n' +
         'Digite o número da opção ou descreva o que precisa:';
}

async function processarConsultaDebitosGeral(userId, documento) {
  // Buscar pertences primeiro
  const resultadoPertences = await consultarPertences(documento);
  
  if (!resultadoPertences.sucesso) {
    limparEstadoUsuario(userId);
    return resultadoPertences.erro;
  }
  
  // Implementar consulta geral de débitos
  limparEstadoUsuario(userId);
  return 'Funcionalidade de consulta geral de débitos em desenvolvimento.\n\n' +
         'Por enquanto, consulte débitos específicos por imóvel ou empresa.';
}

async function processarConsultaDebitosImovel(userId, documento) {
  const resultadoPertences = await consultarPertences(documento);
  
  if (!resultadoPertences.sucesso) {
    limparEstadoUsuario(userId);
    return resultadoPertences.erro;
  }
  
  const inscricoes = obterInscricoesPertences([resultadoPertences.dados]);
  
  if (inscricoes.imoveis.length === 0) {
    limparEstadoUsuario(userId);
    return 'Nenhum imóvel encontrado vinculado a este CPF/CNPJ.';
  }
  
  if (inscricoes.imoveis.length === 1) {
    limparEstadoUsuario(userId);
    return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.IMOVEL, inscricoes.imoveis[0].inscricao);
  }
  
  atualizarEstadoUsuario(userId, {
    estado: ESTADOS.SELECIONANDO_IMOVEL,
    opcoes: inscricoes.imoveis
  });
  
  return formatarOpcoesImoveis(inscricoes.imoveis);
}

async function processarConsultaDebitosEmpresa(userId, documento) {
  const resultadoPertences = await consultarPertences(documento);
  
  if (!resultadoPertences.sucesso) {
    limparEstadoUsuario(userId);
    return resultadoPertences.erro;
  }
  
  const inscricoes = obterInscricoesPertences([resultadoPertences.dados]);
  
  if (inscricoes.empresas.length === 0) {
    limparEstadoUsuario(userId);
    return 'Nenhuma empresa encontrada vinculada a este CPF/CNPJ.';
  }
  
  if (inscricoes.empresas.length === 1) {
    limparEstadoUsuario(userId);
    return await consultarDebitosPorInscricao(TIPO_CONTRIBUINTE.EMPRESA, inscricoes.empresas[0].inscricao);
  }
  
  atualizarEstadoUsuario(userId, {
    estado: ESTADOS.SELECIONANDO_EMPRESA,
    opcoes: inscricoes.empresas
  });
  
  return formatarOpcoesEmpresas(inscricoes.empresas);
}

async function processarConsultaPertences(userId, documento) {
  const resultado = await consultarPertences(documento);
  limparEstadoUsuario(userId);
  
  if (resultado.sucesso) {
    return resultado.dados;
  } else {
    return resultado.erro;
  }
}

async function consultarDebitosPorInscricao(tipoContribuinte, inscricao) {
  const resultado = await consultarDebitos(tipoContribuinte, inscricao);
  
  if (resultado.sucesso) {
    return formatarRespostaDebitos(resultado.dados);
  } else {
    return resultado.erro;
  }
}

module.exports = {
  processarMensagem,
  limparEstadoUsuario
};
