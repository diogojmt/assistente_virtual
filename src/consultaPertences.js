const soap = require('soap');
const logger = require('./logger');

const WSDL_URL = 'https://homologacao.abaco.com.br/arapiraca_proj_hml_eagata/servlet/apwsretornopertences?wsdl';

function validarCpfCnpj(documento) {
  // Remove caracteres especiais
  const doc = documento.replace(/[^\d]/g, '');
  
  // Verifica se é CPF (11 dígitos) ou CNPJ (14 dígitos)
  if (doc.length !== 11 && doc.length !== 14) {
    return false;
  }
  
  // Validação básica de CPF
  if (doc.length === 11) {
    if (/^(\d)\1{10}$/.test(doc)) return false; // Sequência repetida
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(doc.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(doc.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(doc.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    return remainder === parseInt(doc.charAt(10));
  }
  
  // Validação básica de CNPJ
  if (doc.length === 14) {
    if (/^(\d)\1{13}$/.test(doc)) return false; // Sequência repetida
    
    let sum = 0;
    let weight = 5;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(doc.charAt(i)) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    let remainder = sum % 11;
    let firstDigit = remainder < 2 ? 0 : 11 - remainder;
    if (firstDigit !== parseInt(doc.charAt(12))) return false;
    
    sum = 0;
    weight = 6;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(doc.charAt(i)) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    remainder = sum % 11;
    let secondDigit = remainder < 2 ? 0 : 11 - remainder;
    return secondDigit === parseInt(doc.charAt(13));
  }
  
  return false;
}

function formatarDocumento(documento) {
  const doc = documento.replace(/[^\d]/g, '');
  if (doc.length === 11) {
    return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (doc.length === 14) {
    return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return documento;
}

function formatarResposta(result) {
  try {
    let resultado = '';
    
    // Verificar se há resultado válido
    if (!result || !result.SDTRetornoPertences) {
      return 'Nenhum vínculo encontrado para este documento.';
    }
    
    const contribuintes = result.SDTRetornoPertences;
    
    // Se for um array, pegar o primeiro item, senão usar o objeto diretamente
    const contribuinte = Array.isArray(contribuintes) ? contribuintes[0] : contribuintes;
    
    // Verificar se CPF/CNPJ é inválido
    if (contribuinte.SRPCPFCNPJInvalido && contribuinte.SRPCPFCNPJInvalido === 'S') {
      return 'CPF ou CNPJ inválido para consulta.';
    }
    
    // Informações do contribuinte
    if (contribuinte.SRPNomeContribuinte) {
      resultado += `👤 **Nome:** ${contribuinte.SRPNomeContribuinte}\n`;
    }
    
    if (contribuinte.SRPCPFCNPJContribuinte) {
      resultado += `📄 **Documento:** ${formatarDocumento(contribuinte.SRPCPFCNPJContribuinte)}\n`;
    }
    
    if (contribuinte.SRPPossuiDebitoPFPJ) {
      const status = contribuinte.SRPPossuiDebitoPFPJ === 'S' ? '❌ Possui débitos' : '✅ Sem débitos';
      resultado += `💰 **Status de Débitos:** ${status}\n`;
    }
    
    // Empresas vinculadas
    if (contribuinte.SDTRetornoPertencesEmpresa && contribuinte.SDTRetornoPertencesEmpresa.length > 0) {
      resultado += `\n🏢 **Empresas Vinculadas:**\n`;
      
      contribuinte.SDTRetornoPertencesEmpresa.forEach((empresa, index) => {
        resultado += `\n   **${index + 1}.** `;
        if (empresa.SRPInscricaoEmpresa) {
          resultado += `Inscrição: ${empresa.SRPInscricaoEmpresa}\n`;
        }
        if (empresa.SRPEnderecoEmpresa) {
          resultado += `   📍 Endereço: ${empresa.SRPEnderecoEmpresa}\n`;
        }
        if (empresa.SRPAutonomo === 'S') {
          resultado += `   👤 Autônomo\n`;
        }
        if (empresa.SRPPossuiDebitoEmpresa) {
          const statusEmpresa = empresa.SRPPossuiDebitoEmpresa === 'S' ? '❌ Com débitos' : '✅ Sem débitos';
          resultado += `   💰 ${statusEmpresa}\n`;
        }
      });
    }
    
    // Imóveis vinculados
    if (contribuinte.SDTRetornoPertencesImovel && contribuinte.SDTRetornoPertencesImovel.length > 0) {
      resultado += `\n🏠 **Imóveis Vinculados:**\n`;
      
      contribuinte.SDTRetornoPertencesImovel.forEach((imovel, index) => {
        resultado += `\n   **${index + 1}.** `;
        if (imovel.SRPInscricaoImovel) {
          resultado += `Inscrição: ${imovel.SRPInscricaoImovel}\n`;
        }
        if (imovel.SRPTipoImovel) {
          resultado += `   🏷️ Tipo: ${imovel.SRPTipoImovel}\n`;
        }
        if (imovel.SRPEnderecoImovel) {
          resultado += `   📍 Endereço: ${imovel.SRPEnderecoImovel}\n`;
        }
        if (imovel.SRPPossuiDebitoImovel) {
          const statusImovel = imovel.SRPPossuiDebitoImovel === 'S' ? '❌ Com débitos' : '✅ Sem débitos';
          resultado += `   💰 ${statusImovel}\n`;
        }
      });
    }
    
    if (!resultado) {
      return 'Nenhum vínculo encontrado para este documento.';
    }
    
    return resultado;
    
  } catch (error) {
    logger.error('Erro ao formatar resposta:', error);
    return 'Erro ao processar a resposta da consulta.';
  }
}

async function consultarPertences(cpfCnpj) {
  try {
    logger.info(`Iniciando consulta de pertences para documento: ${cpfCnpj.replace(/\d/g, '*')}`);
    
    // Validar CPF/CNPJ
    if (!validarCpfCnpj(cpfCnpj)) {
      throw new Error('CPF ou CNPJ inválido');
    }
    
    const documento = cpfCnpj.replace(/[^\d]/g, '');
    
    // Criar cliente SOAP
    const client = await soap.createClientAsync(WSDL_URL, {
      timeout: 30000, // 30 segundos
      forceSoap12Headers: false
    });
    
    logger.info('Cliente SOAP criado com sucesso');
    
    // Preparar parâmetros da consulta
    const params = {
      Flagtipopesquisa: 'C',
      Ctgcpf: documento,
      Ctiinscricao: ''
    };
    
    logger.info('Enviando requisição SOAP...');
    
    // Fazer a chamada SOAP (método correto é Execute)
    const [result] = await client.ExecuteAsync(params);
    
    logger.info('Resposta SOAP recebida');
    
    // Processar resposta
    if (result) {
      const resposta = formatarResposta(result);
      logger.info('Consulta realizada com sucesso');
      return {
        sucesso: true,
        dados: resposta
      };
    } else {
      logger.warn('Resposta SOAP vazia ou inválida');
      return {
        sucesso: false,
        erro: 'Nenhum dado retornado pelo serviço'
      };
    }
    
  } catch (error) {
    logger.error('Erro na consulta de pertences:', error.message);
    
    // Verificar tipo de erro
    if (error.message.includes('CPF ou CNPJ inválido')) {
      return {
        sucesso: false,
        erro: 'CPF ou CNPJ inválido. Verifique o número informado.'
      };
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        sucesso: false,
        erro: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.'
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        sucesso: false,
        erro: 'A consulta demorou mais que o esperado. Tente novamente.'
      };
    } else {
      return {
        sucesso: false,
        erro: 'Não foi possível realizar a consulta no momento. Tente novamente mais tarde.'
      };
    }
  }
}

module.exports = {
  consultarPertences,
  validarCpfCnpj,
  formatarDocumento
};
