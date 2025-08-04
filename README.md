# Bot WhatsApp + OpenAI Assistant

Bot inteligente para WhatsApp que integra com OpenAI Assistants API e oferece consultas municipais completas para a Secretaria da Fazenda de Arapiraca-AL.

## 🚀 Funcionalidades

- 🤖 **Integração completa com OpenAI Assistants API**
- 📱 **Bot WhatsApp usando Baileys**
- 🎤 **Transcrição de áudios** via OpenAI Whisper
- 🏛️ **Consulta de pertences municipais via WebService SOAP**
- 💰 **Consulta de débitos municipais** (IPTU, ISS, taxas)
- 🧠 **Sistema conversacional inteligente** com gerenciamento de estados
- 🔍 **Validação de CPF/CNPJ** com algoritmo nativo
- 🔒 **Configuração segura** com variáveis de ambiente
- 📝 **Logging detalhado** para diagnósticos
- 🔄 **Tratamento robusto de erros**
- 🚀 **Compatível com Replit**
- 💬 **Detecção de intenções** em linguagem natural
- 📊 **Formatação inteligente** de respostas

## 📋 Pré-requisitos

- Node.js 22.17.0+ 
- **FFmpeg** (para transcrição de áudios)
- Conta OpenAI com API key
- Assistant criado na plataforma OpenAI (com funções configuradas)
- WhatsApp Business (recomendado)
- Chave de acesso à API Ábaco (para débitos municipais)
- Acesso ao WebService SOAP de consulta de pertences

## 🛠️ Instalação

1. Clone o projeto:
```bash
git clone <seu-repositorio>
cd assistente_virtual
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite o arquivo `.env` com suas credenciais:
```env
OPENAI_API_KEY=[REDACTED:api-key]
OPENAI_ASSISTANT_ID=seu_id_do_assistente_aqui
ABACO_API_KEY=sua_chave_api_abaco_aqui
PORT=3000
```

## 🏗️ Estrutura do projeto

```
assistente_virtual/
├── src/
│   ├── consultaPertences.js    # Consulta de pertences via SOAP
│   ├── conversationManager.js  # Gerenciador de conversas inteligente
│   ├── debitosService.js       # Consulta de débitos via API Ábaco
│   ├── logger.js               # Configuração de logs
│   ├── openai-service.js       # Integração com OpenAI
│   └── whatsapp-bot.js         # Bot do WhatsApp
├── index.js                    # Arquivo principal
├── package.json
├── .env                        # Variáveis de ambiente
├── .gitignore
├── ASSISTANT_FUNCTIONS.md      # Configuração das funções OpenAI
└── README.md
```

## ⚙️ Configuração do OpenAI Assistant

**IMPORTANTE:** O bot utiliza funções customizadas no OpenAI Assistant. Você deve configurar as seguintes funções:

1. **consultar_pertences** - Para consulta de vínculos
2. **consultar_debitos** - Para consulta de débitos municipais  
3. **encerrar_atendimento** - Para finalizar conversas

📖 **Veja o arquivo [`ASSISTANT_FUNCTIONS.md`](./ASSISTANT_FUNCTIONS.md)** para instruções detalhadas de configuração.

## 🎯 Como usar

1. Inicie o bot:
```bash
npm start
```

2. Escaneie o QR Code que aparece no terminal com seu WhatsApp

3. Envie mensagens (texto ou áudio) como:
   - "Quero ver meus débitos"
   - "Débitos do imóvel 123456"
   - "Vínculos do CPF 12345678901"
   - "Minha empresa tem débito?"
   - 🎤 Áudios de até 30 segundos

4. O bot processará a solicitação e fornecerá respostas formatadas

## 📊 Scripts disponíveis

- `npm start` - Inicia o bot em produção
- `npm run dev` - Inicia o bot em modo desenvolvimento (com nodemon)

## 🧠 Sistema Conversacional

O bot inclui um sistema inteligente de conversas com:

### Estados de Conversa:
- **Inicial** - Aguardando comando do usuário
- **Aguardando CPF/CNPJ** - Solicitando documento
- **Selecionando Imóvel** - Escolhendo entre múltiplos imóveis
- **Selecionando Empresa** - Escolhendo entre múltiplas empresas
- **Aguardando Inscrição** - Processando inscrição municipal

### Detecção de Intenções:
- **Saudações** e despedidas
- **Consultas de débitos** (geral, imóvel, empresa)
- **Consultas de pertences/vínculos**
- **Seleções numéricas** (1, 2, 3...)
- **Documentos** (CPF/CNPJ automático)
- **Inscrições municipais**

## 💰 Consulta de Débitos

O sistema oferece consulta completa de débitos municipais:

### Tipos de Débitos:
- **IPTU** (Imposto Predial e Territorial Urbano)
- **ISS** (Imposto Sobre Serviços)
- **COSIP** (Contribuição para Custeio da Iluminação Pública)
- **Taxas municipais** diversas

### Informações Fornecidas:
- Valor total do débito
- Valor original
- Juros e multas
- Descontos aplicáveis
- Data de vencimento
- Linha digitável para pagamento
- Link para emissão de DAM

### Limitações Inteligentes:
- Máximo de 5 débitos detalhados por consulta
- Aviso quando há mais resultados
- Orientação para procurar a Secretaria em casos complexos

## 🏛️ Consulta de Pertences

Funcionalidade para consulta de vínculos municipais:

- **Imóveis vinculados** ao CPF/CNPJ
- **Empresas vinculadas** ao CPF/CNPJ
- **Endereços completos**
- **Tipos de propriedade**
- **Inscrições municipais**

## 🌐 Deploy no Replit

### Configuração Automática

O projeto inclui configuração automática para Replit com FFmpeg:

1. **Importe o projeto** no Replit
2. **Configure as variáveis de ambiente** (Secrets):
   - `OPENAI_API_KEY`
   - `OPENAI_ASSISTANT_ID`
   - `ABACO_API_KEY`
3. **Reconstrua o ambiente**: Execute "Reload Environment" no shell
4. **Teste o FFmpeg**: Execute `node test-ffmpeg.js`
5. **Configure as funções** no OpenAI Assistant (veja ASSISTANT_FUNCTIONS.md)
6. **Execute o bot**: `npm start`
7. **Mantenha ativo**: Configure Always On

### Arquivos de Configuração Replit

- `replit.nix` - Dependências do sistema (Node.js, FFmpeg)
- `.replit` - Configuração de execução e portas
- `test-ffmpeg.js` - Script de teste de FFmpeg

### Verificação da Instalação

Execute no shell do Replit:
```bash
# Verificar FFmpeg
ffmpeg -version

# Testar configuração completa
node test-ffmpeg.js
```

### ⚠️ Importante para Replit

- O **FFmpeg é essencial** para transcrição de áudios
- Use "Reload Environment" após modificar `replit.nix`
- Verifique os logs de inicialização para confirmar FFmpeg
- Configure Always On para funcionamento contínuo

## 📊 Logs e monitoramento

O bot gera logs detalhados para facilitar o diagnóstico:

- **Mensagens recebidas e enviadas**
- **Interações com APIs** (OpenAI, Ábaco, SOAP)
- **Estados de conversa** por usuário
- **Erros e exceções** detalhados
- **Status de conexão** do WhatsApp
- **Performance** das consultas

## ⚠️ Tratamento de erros

O bot inclui tratamento robusto para:

- **Falhas na API da OpenAI**
- **Problemas de conexão do WhatsApp**
- **Erros na API Ábaco** (débitos)
- **Falhas no WebService SOAP** (pertences)
- **Mensagens inválidas**
- **Timeouts e rate limits**
- **CPF/CNPJ inválidos**
- **Inscrições municipais não encontradas**

## 🔧 Dependências Principais

- **@whiskeysockets/baileys**: Cliente WhatsApp Web
- **axios**: Cliente HTTP para requisições
- **dotenv**: Gerenciamento de variáveis de ambiente
- **express**: Framework web para endpoints
- **fluent-ffmpeg**: Conversão de áudio (OGG → MP3)
- **form-data**: Upload de arquivos para OpenAI
- **fs-extra**: Operações de sistema de arquivos
- **pino**: Sistema de logging estruturado
- **pino-pretty**: Formatação de logs
- **qrcode-terminal**: Exibição de QR Code no terminal
- **soap**: Cliente para WebServices SOAP

## 🚨 Limitações

- **Contexto por usuário** mantido durante a sessão
- **Suporte para texto e áudio** (máximo 30 segundos)
- **Rate limits** da OpenAI aplicam-se
- **Consulta de pertences** limitada ao ambiente configurado
- **Consulta de débitos** limitada ao exercício configurado
- **Máximo de 5 débitos** detalhados por consulta
- **Máximo de 10 imóveis/empresas** por listagem
- **FFmpeg obrigatório** para transcrição de áudios

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

ISC

## 🆘 Suporte

Para dúvidas ou problemas:

1. **Verifique os logs** do bot para erros específicos
2. **Confirme as configurações** do arquivo `.env`
3. **Teste a conectividade** com APIs (OpenAI, Ábaco)
4. **Verifique as funções** configuradas no OpenAI Assistant
5. **Consulte** o arquivo `ASSISTANT_FUNCTIONS.md`
6. **Abra uma issue** no repositório

### Contatos da Secretaria:
- **Secretaria Municipal da Fazenda de Arapiraca-AL**
- **Website**: [Prefeitura de Arapiraca](https://arapiraca.al.gov.br)

---

*Desenvolvido para a Secretaria Municipal da Fazenda de Arapiraca-AL*
