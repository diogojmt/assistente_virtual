const soap = require('soap');
const axios = require('axios');
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

function parseXMLResponse(xmlString) {
  try {
    const contribuintes = [];
    
    // Buscar por SDTRetornoPertencesItem
    const itemRegex = /<SDTRetornoPertences\.SDTRetornoPertencesItem[^>]*>([\s\S]*?)<\/SDTRetornoPertences\.SDTRetornoPertencesItem>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlString)) !== null) {
      const itemXML = match[1];
      const contribuinte = {};
      
      // Extrair campos do contribuinte
      const fields = [
        'SRPCodigoContribuinte',
        'SRPCPFCNPJInvalido', 
        'SRPNomeContribuinte',
        'SRPCPFCNPJContribuinte',
        'SRPPossuiDebitoPFPJ'
      ];
      
      fields.forEach(field => {
        const fieldRegex = new RegExp(`<${field}>(.*?)<\/${field}>`, 'g');
        const fieldMatch = fieldRegex.exec(itemXML);
        if (fieldMatch) {
          contribuinte[field] = fieldMatch[1];
        }
      });
      
      // Extrair empresas
      contribuinte.SDTRetornoPertencesEmpresa = [];
      const empresaRegex = /<SDTRetornoPertencesEmpresaItem[^>]*>([\s\S]*?)<\/SDTRetornoPertencesEmpresaItem>/g;
      let empresaMatch;
      
      while ((empresaMatch = empresaRegex.exec(itemXML)) !== null) {
        const empresaXML = empresaMatch[1];
        const empresa = {};
        
        const empresaFields = [
          'SRPInscricaoEmpresa',
          'SRPAutonomo',
          'SRPDebitoSuspensoEmpresa',
          'SRPEnderecoEmpresa',
          'SRPPossuiDebitoEmpresa',
          'SRPTipoProprietario',
          'SRPSocioEmpresa'
        ];
        
        empresaFields.forEach(field => {
          const fieldRegex = new RegExp(`<${field}>(.*?)<\/${field}>`, 'g');
          const fieldMatch = fieldRegex.exec(empresaXML);
          if (fieldMatch) {
            empresa[field] = fieldMatch[1];
          }
        });
        
        contribuinte.SDTRetornoPertencesEmpresa.push(empresa);
      }
      
      // Extrair imóveis (caso existam)
      contribuinte.SDTRetornoPertencesImovel = [];
      const imovelRegex = /<SDTRetornoPertencesImovelItem[^>]*>([\s\S]*?)<\/SDTRetornoPertencesImovelItem>/g;
      let imovelMatch;
      
      while ((imovelMatch = imovelRegex.exec(itemXML)) !== null) {
        const imovelXML = imovelMatch[1];
        const imovel = {};
        
        const imovelFields = [
          'SRPInscricaoImovel',
          'SRPDebitoSuspensoImovel',
          'SRPTipoImovel',
          'SRPEnderecoImovel',
          'SRPTipoProprietario',
          'SRPPossuiDebitoImovel',
          'SRPProprietario'
        ];
        
        imovelFields.forEach(field => {
          const fieldRegex = new RegExp(`<${field}>(.*?)<\/${field}>`, 'g');
          const fieldMatch = fieldRegex.exec(imovelXML);
          if (fieldMatch) {
            imovel[field] = fieldMatch[1];
          }
        });
        
        contribuinte.SDTRetornoPertencesImovel.push(imovel);
      }
      
      contribuintes.push(contribuinte);
    }
    
    return contribuintes;
    
  } catch (error) {
    logger.error('Erro ao fazer parse do XML:', error);
    return [];
  }
}

function formatarResposta(contribuintes) {
  try {
    if (!contribuintes || contribuintes.length === 0) {
      return 'Nenhum vínculo encontrado para este documento.';
    }
    
    const contribuinte = contribuintes[0];
    let resultado = '';
    
    // Verificar se CPF/CNPJ é inválido
    if (contribuinte.SRPCPFCNPJInvalido === 'S') {
      return 'CPF ou CNPJ inválido para consulta.';
    }
    
    // Informações do contribuinte
    if (contribuinte.SRPNomeContribuinte) {
      resultado += `👤 **Nome:** ${contribuinte.SRPNomeContribuinte}\n`;
    }
    
    if (contribuinte.SRPCPFCNPJContribuinte) {
      resultado += `📄 **Documento:** ${formatarDocumento(contribuinte.SRPCPFCNPJContribuinte)}\n`;
    }
    
    if (contribuinte.SRPPossuiDebitoPFPJ !== undefined) {
      const status = contribuinte.SRPPossuiDebitoPFPJ === 'S' ? '❌ Possui débitos' : '✅ Sem débitos';
      resultado += `💰 **Status de Débitos:** ${status}\n`;
    }
    
    // Empresas vinculadas
    if (contribuinte.SDTRetornoPertencesEmpresa && contribuinte.SDTRetornoPertencesEmpresa.length > 0) {
      const totalEmpresas = contribuinte.SDTRetornoPertencesEmpresa.length;
      const empresasParaExibir = contribuinte.SDTRetornoPertencesEmpresa.slice(0, 10);
      
      resultado += `\n🏢 **Empresas Vinculadas** (${totalEmpresas}):\n`;
      
      empresasParaExibir.forEach((empresa, index) => {
        resultado += `\n   **${index + 1}.** `;
        if (empresa.SRPInscricaoEmpresa) {
          resultado += `Inscrição: ${empresa.SRPInscricaoEmpresa}\n`;
        }
        if (empresa.SRPEnderecoEmpresa) {
          resultado += `   📍 Endereço: ${empresa.SRPEnderecoEmpresa}\n`;
        }
        if (empresa.SRPAutonomo === 'S') {
          resultado += `   👤 Autônomo\n`;
        } else if (empresa.SRPAutonomo === 'E') {
          resultado += `   🏢 Empresa\n`;
        }
        if (empresa.SRPPossuiDebitoEmpresa !== undefined) {
          const statusEmpresa = empresa.SRPPossuiDebitoEmpresa === 'S' ? '❌ Com débitos' : '✅ Sem débitos';
          resultado += `   💰 ${statusEmpresa}\n`;
        }
      });
      
      if (totalEmpresas > 10) {
        resultado += `\n   ⚠️ *Mostrando apenas os primeiros 10 de ${totalEmpresas} vínculos empresariais.*\n`;
        resultado += `   *Para informações completas, procure a Secretaria Municipal da Fazenda.*\n`;
      }
    }
    
    // Imóveis vinculados
    if (contribuinte.SDTRetornoPertencesImovel && contribuinte.SDTRetornoPertencesImovel.length > 0) {
      const totalImoveis = contribuinte.SDTRetornoPertencesImovel.length;
      const imoveisParaExibir = contribuinte.SDTRetornoPertencesImovel.slice(0, 10);
      
      resultado += `\n🏠 **Imóveis Vinculados** (${totalImoveis}):\n`;
      
      imoveisParaExibir.forEach((imovel, index) => {
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
        if (imovel.SRPPossuiDebitoImovel !== undefined) {
          const statusImovel = imovel.SRPPossuiDebitoImovel === 'S' ? '❌ Com débitos' : '✅ Sem débitos';
          resultado += `   💰 ${statusImovel}\n`;
        }
      });
      
      if (totalImoveis > 10) {
        resultado += `\n   ⚠️ *Mostrando apenas os primeiros 10 de ${totalImoveis} imóveis.*\n`;
        resultado += `   *Para informações completas, procure a Secretaria Municipal da Fazenda.*\n`;
      }
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
    
    // Preparar XML SOAP
    const soapXML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tns="eAgata_Arapiraca_Maceio_Ev3">
  <soap:Body>
    <tns:Execute>
      <tns:Flagtipopesquisa>C</tns:Flagtipopesquisa>
      <tns:Ctgcpf>${documento}</tns:Ctgcpf>
      <tns:Ctiinscricao></tns:Ctiinscricao>
    </tns:Execute>
  </soap:Body>
</soap:Envelope>`;
    
    logger.info('Enviando requisição HTTP SOAP...');
    
    // Fazer requisição HTTP direta
    const response = await axios.post(
      'https://homologacao.abaco.com.br/arapiraca_proj_hml_eagata/servlet/apwsretornopertences',
      soapXML,
      {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"Execute"'
        },
        timeout: 30000
      }
    );
    
    logger.info('Resposta HTTP recebida');
    
    // Fazer parse do XML
    const contribuintes = parseXMLResponse(response.data);
    
    // Processar resposta
    if (contribuintes && contribuintes.length > 0) {
      const resposta = formatarResposta(contribuintes);
      logger.info('Consulta realizada com sucesso');
      return {
        sucesso: true,
        dados: resposta
      };
    } else {
      logger.warn('Nenhum contribuinte encontrado na resposta');
      return {
        sucesso: true,
        dados: 'Nenhum vínculo encontrado para este documento.'
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
    } else if (error.response && error.response.status) {
      return {
        sucesso: false,
        erro: `Erro no serviço (${error.response.status}). Tente novamente mais tarde.`
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
