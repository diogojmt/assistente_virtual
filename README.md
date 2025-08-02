# Bot WhatsApp + OpenAI Assistant

Bot para WhatsApp que integra com a OpenAI Assistants API para fornecer respostas inteligentes automáticas.

## Funcionalidades

- 🤖 Integração completa com OpenAI Assistants API
- 📱 Bot WhatsApp usando Baileys
- 🔒 Configuração segura com variáveis de ambiente
- 📝 Logging detalhado para diagnósticos
- 🔄 Tratamento robusto de erros
- 🚀 Compatível com Replit

## Pré-requisitos

- Node.js 18+ 
- Conta OpenAI com API key
- Assistant criado na plataforma OpenAI
- WhatsApp Business (recomendado)

## Instalação

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
OPENAI_API_KEY=sua_chave_da_openai_aqui
OPENAI_ASSISTANT_ID=seu_id_do_assistente_aqui
PORT=3000
```

## Como usar

1. Inicie o bot:
```bash
npm start
```

2. Escaneie o QR Code que aparece no terminal com seu WhatsApp

3. Envie uma mensagem para o número do bot

4. O bot enviará a mensagem para a OpenAI e retornará a resposta

## Scripts disponíveis

- `npm start` - Inicia o bot em produção
- `npm run dev` - Inicia o bot em modo desenvolvimento (com nodemon)

## Configuração do OpenAI Assistant

1. Acesse [platform.openai.com](https://platform.openai.com)
2. Crie um novo Assistant
3. Configure as instruções e modelo desejado
4. Copie o ID do Assistant para o arquivo `.env`

## Estrutura do projeto

```
assistente_virtual/
├── src/
│   ├── logger.js          # Configuração de logs
│   ├── openai-service.js  # Integração com OpenAI
│   └── whatsapp-bot.js    # Bot do WhatsApp
├── index.js               # Arquivo principal
├── package.json
├── .env                   # Variáveis de ambiente
├── .gitignore
└── README.md
```

## Deploy no Replit

1. Importe o projeto no Replit
2. Configure as variáveis de ambiente:
   - `OPENAI_API_KEY`
   - `OPENAI_ASSISTANT_ID`
3. Execute `npm install`
4. Execute `npm start`
5. Mantenha o Replit sempre ativo (Always On)

## Logs e monitoramento

O bot gera logs detalhados para facilitar o diagnóstico:

- Mensagens recebidas e enviadas
- Interações com a OpenAI API
- Erros e exceções
- Status de conexão do WhatsApp

## Tratamento de erros

O bot inclui tratamento robusto para:

- Falhas na API da OpenAI
- Problemas de conexão do WhatsApp
- Mensagens inválidas
- Timeouts e rate limits

## Limitações

- Uma thread OpenAI por mensagem (não mantém contexto entre mensagens)
- Suporte apenas para mensagens de texto
- Rate limits da OpenAI aplicam-se

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## Licença

ISC

## Suporte

Para dúvidas ou problemas:
1. Verifique os logs do bot
2. Confirme as configurações do arquivo `.env`
3. Teste a conectividade com a OpenAI API
4. Abra uma issue no repositório
