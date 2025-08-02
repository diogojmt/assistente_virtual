const soap = require('soap');

const WSDL_URL = 'https://homologacao.abaco.com.br/arapiraca_proj_hml_eagata/servlet/apwsretornopertences?wsdl';

async function testarRaw() {
  console.log('=== Teste Raw do WebService ===\n');
  
  try {
    // Criar cliente SOAP com mais opções
    const client = await soap.createClientAsync(WSDL_URL, {
      timeout: 30000,
      forceSoap12Headers: false,
      returnFault: true
    });
    
    console.log('Cliente criado.');
    
    // Interceptar as requisições e respostas
    client.on('request', (xml) => {
      console.log('\n=== XML ENVIADO ===');
      console.log(xml);
      console.log('=== FIM XML ENVIADO ===\n');
    });
    
    client.on('response', (body, response) => {
      console.log('\n=== RESPOSTA RAW ===');
      console.log('Status:', response.statusCode);
      console.log('Headers:', response.headers);
      console.log('Body:', body);
      console.log('=== FIM RESPOSTA RAW ===\n');
    });
    
    const params = {
      Flagtipopesquisa: 'C',
      Ctgcpf: '03718472490',
      Ctiinscricao: ''
    };
    
    console.log('Enviando requisição...');
    
    // Usar callback para capturar mais informações
    client.Execute(params, (err, result, raw, soapHeader) => {
      if (err) {
        console.log('Erro na chamada:', err);
      } else {
        console.log('Resultado callback:', JSON.stringify(result, null, 2));
        console.log('XML Raw:', raw);
        console.log('SOAP Header:', soapHeader);
      }
    });
    
  } catch (error) {
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
  }
}

testarRaw();

// Aguardar um pouco para os eventos assíncronos
setTimeout(() => {
  process.exit(0);
}, 10000);
