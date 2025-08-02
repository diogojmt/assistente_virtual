const axios = require('axios');
const logger = require('./logger');

const API_URL = 'https://homologacao.abaco.com.br/arapiraca_proj_hml_eagata/servlet/apapidebito';

// Tipos de contribuinte
const TIPO_CONTRIBUINTE = {
  PF_PJ: '1',
  IMOVEL: '2', 
  EMPRESA: '3'
};

// Tipos de consumo
const TIPO_CONSUMO = {
  LISTAR_DEBITOS: '1',
  EMITIR_DEBITO_ESPECIFICO: '2'
};

function formatarValor(valor) {
  if (!valor || valor === 0) return 'R$ 0,00';
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function formatarData(data) {
  if (!data) return '';
  try {
    const dataObj = new Date(data);
    return dataObj.toLocaleDateString('pt-BR');
  } catch (error) {
    return data;
  }
}

function formatarTributos(tributos) {
  if (!tributos) return '';
  
  // Remove códigos e formata os nomes dos tributos
  return tributos
    .split('|')
    .map(tributo => tributo.trim())
    .filter(tributo => tributo && tributo !== '')
    .map(tributo => {
      // Remove códigos no formato "2039 - "
      return tributo.replace(/^\d+\s*-\s*/, '');
    })
    .join(', ');
}

function formatarLinhaDigitavel(linha) {
  if (!linha) return '';
  // Adiciona espaços para melhor legibilidade
  return linha.replace(/(\d{5})(\d{5})\-(\d{1})\s*(\d{5})(\d{6})\-(\d{1})\s*(\d{5})(\d{6})\-(\d{1})\s*(\d{1})(\d{13})\-(\d{1})/, 
    '$1.$2-$3 $4.$5-$6 $7.$8-$9 $10 $11-$12');
}

async function consultarDebitos(tipoContribuinte, inscricao, exercicio = '2025') {
  try {
    logger.info(`Consultando débitos - Tipo: ${tipoContribuinte}, Inscrição: ${inscricao}`);
    
    const chaveAPI = process.env.ABACO_API_KEY;
    if (!chaveAPI) {
      throw new Error('Chave da API Ábaco não configurada');
    }
    
    const parametros = {
      SSEChave: chaveAPI,
      SSETipoContribuinte: tipoContribuinte,
      SSEInscricao: inscricao,
      SSEExercicioDebito: exercicio,
      SSETipoConsumo: TIPO_CONSUMO.LISTAR_DEBITOS,
      SSENossoNumero: '',
      SSECPFCNPJ: '',
      SSEOperacao: '',
      SSEIdentificador: ''
    };
    
    const response = await axios.get(API_URL, {
      headers: {
        'DadosAPI': JSON.stringify(parametros),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    logger.info('Resposta da API de débitos recebida');
    
    if (response.data.SSACodigo !== 0) {
      logger.warn(`Erro na API: ${response.data.SSAMensagem}`);
      return {
        sucesso: false,
        erro: response.data.SSAMensagem || 'Erro na consulta de débitos'
      };
    }
    
    return {
      sucesso: true,
      dados: response.data
    };
    
  } catch (error) {
    logger.error('Erro na consulta de débitos:', error.message);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        sucesso: false,
        erro: 'Serviço de débitos temporariamente indisponível. Tente novamente em alguns minutos.'
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        sucesso: false,
        erro: 'A consulta demorou mais que o esperado. Tente novamente.'
      };
    } else if (error.response && error.response.status) {
      return {
        sucesso: false,
        erro: `Erro no serviço de débitos (${error.response.status}). Tente novamente mais tarde.`
      };
    } else {
      return {
        sucesso: false,
        erro: 'Não foi possível consultar os débitos no momento. Tente novamente mais tarde.'
      };
    }
  }
}

async function emitirDebitoEspecifico(tipoContribuinte, inscricao, identificador, exercicio = '2025') {
  try {
    logger.info(`Emitindo débito específico - ID: ${identificador}`);
    
    const chaveAPI = process.env.ABACO_API_KEY;
    if (!chaveAPI) {
      throw new Error('Chave da API Ábaco não configurada');
    }
    
    const parametros = {
      SSEChave: chaveAPI,
      SSETipoContribuinte: tipoContribuinte,
      SSEInscricao: inscricao,
      SSEExercicioDebito: exercicio,
      SSETipoConsumo: TIPO_CONSUMO.EMITIR_DEBITO_ESPECIFICO,
      SSENossoNumero: '',
      SSECPFCNPJ: '',
      SSEOperacao: '',
      SSEIdentificador: identificador
    };
    
    const response = await axios.get(API_URL, {
      headers: {
        'DadosAPI': JSON.stringify(parametros),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return {
      sucesso: true,
      dados: response.data
    };
    
  } catch (error) {
    logger.error('Erro ao emitir débito específico:', error.message);
    return {
      sucesso: false,
      erro: 'Erro ao emitir o débito específico.'
    };
  }
}

function formatarRespostaDebitos(dadosAPI) {
  try {
    if (!dadosAPI || !dadosAPI.SDTSaidaAPIDebito || dadosAPI.SDTSaidaAPIDebito.length === 0) {
      return '✅ *Nenhum débito encontrado!*\n\nParabéns! Não há débitos em aberto para esta inscrição.';
    }
    
    let resultado = '';
    const debitos = dadosAPI.SDTSaidaAPIDebito;
    
    // Cabeçalho com informações do contribuinte
    if (dadosAPI.SSANomeRazao) {
      resultado += `👤 **${dadosAPI.SSANomeRazao}**\n`;
    }
    
    if (dadosAPI.SSAInscricao) {
      resultado += `📄 **Inscrição:** ${dadosAPI.SSAInscricao}\n`;
    }
    
    if (dadosAPI.SSATipoContribuinte) {
      resultado += `🏷️ **Tipo:** ${dadosAPI.SSATipoContribuinte}\n`;
    }
    
    const totalDebitos = debitos.length;
    resultado += `\n💰 **Débitos em Aberto** (${totalDebitos}):\n`;
    
    // Limitar a 5 débitos para não sobrecarregar o WhatsApp
    const debitosParaExibir = debitos.slice(0, 5);
    
    debitosParaExibir.forEach((debito, index) => {
      resultado += `\n🔸 **Débito ${index + 1}**\n`;
      
      if (debito.SSATributo) {
        const tributosFormatados = formatarTributos(debito.SSATributo);
        resultado += `   📋 ${tributosFormatados}\n`;
      }
      
      if (debito.SSAReferencia) {
        resultado += `   📅 Referência: ${debito.SSAReferencia}\n`;
      }
      
      if (debito.SSAValorTotal) {
        resultado += `   💵 **Valor Total: ${formatarValor(debito.SSAValorTotal)}**\n`;
      }
      
      if (debito.SSAValorOriginal && debito.SSAValorOriginal !== debito.SSAValorTotal) {
        resultado += `   💰 Valor Original: ${formatarValor(debito.SSAValorOriginal)}\n`;
      }
      
      if (debito.SSAValorDesconto && debito.SSAValorDesconto > 0) {
        resultado += `   🎯 Desconto: ${formatarValor(debito.SSAValorDesconto)}\n`;
      }
      
      if (debito.SSAValorJuros && debito.SSAValorJuros > 0) {
        resultado += `   📈 Juros: ${formatarValor(debito.SSAValorJuros)}\n`;
      }
      
      if (debito.SSAValorMulta && debito.SSAValorMulta > 0) {
        resultado += `   🚨 Multa: ${formatarValor(debito.SSAValorMulta)}\n`;
      }
      
      if (debito.SSAVencimento) {
        const dataVenc = formatarData(debito.SSAVencimento);
        resultado += `   ⏰ Vencimento: ${dataVenc}\n`;
      }
      
      if (debito.SSALinhaDigitavel) {
        const linhaFormatada = formatarLinhaDigitavel(debito.SSALinhaDigitavel);
        resultado += `   🏦 Linha Digitável:\n   \`${linhaFormatada}\`\n`;
      }
      
      if (debito.SSALinkkDAM) {
        resultado += `   🔗 [Emitir DAM](${debito.SSALinkkDAM})\n`;
      }
    });
    
    if (totalDebitos > 5) {
      resultado += `\n⚠️ *Mostrando apenas os primeiros 5 de ${totalDebitos} débitos.*\n`;
      resultado += `*Para informações completas, procure a Secretaria Municipal da Fazenda.*\n`;
    }
    
    // Totalizador
    const valorTotalGeral = debitos.reduce((total, debito) => total + (debito.SSAValorTotal || 0), 0);
    if (valorTotalGeral > 0) {
      resultado += `\n💰 **TOTAL GERAL: ${formatarValor(valorTotalGeral)}**`;
    }
    
    return resultado;
    
  } catch (error) {
    logger.error('Erro ao formatar resposta de débitos:', error);
    return 'Erro ao processar informações de débitos.';
  }
}

// Função auxiliar para mapear inscrições dos pertences para consulta de débitos
function obterInscricoesPertences(contribuintes) {
  const inscricoes = {
    empresas: [],
    imoveis: []
  };
  
  if (!contribuintes || contribuintes.length === 0) {
    return inscricoes;
  }
  
  const contribuinte = contribuintes[0];
  
  // Empresas
  if (contribuinte.SDTRetornoPertencesEmpresa) {
    contribuinte.SDTRetornoPertencesEmpresa.forEach(empresa => {
      if (empresa.SRPInscricaoEmpresa) {
        inscricoes.empresas.push({
          inscricao: empresa.SRPInscricaoEmpresa,
          endereco: empresa.SRPEnderecoEmpresa,
          tipo: empresa.SRPAutonomo === 'S' ? 'Autônomo' : 'Empresa'
        });
      }
    });
  }
  
  // Imóveis
  if (contribuinte.SDTRetornoPertencesImovel) {
    contribuinte.SDTRetornoPertencesImovel.forEach(imovel => {
      if (imovel.SRPInscricaoImovel) {
        inscricoes.imoveis.push({
          inscricao: imovel.SRPInscricaoImovel,
          endereco: imovel.SRPEnderecoImovel,
          tipo: imovel.SRPTipoImovel
        });
      }
    });
  }
  
  return inscricoes;
}

module.exports = {
  consultarDebitos,
  emitirDebitoEspecifico,
  formatarRespostaDebitos,
  obterInscricoesPertences,
  TIPO_CONTRIBUINTE,
  TIPO_CONSUMO
};
