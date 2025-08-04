# Funcionalidade de Transcrição de Áudio

## Visão Geral

O assistente virtual agora suporta transcrição automática de mensagens de voz enviadas via WhatsApp, permitindo que os usuários interajam usando áudios que são convertidos em texto e processados normalmente pelo sistema.

## Características Principais

### ✅ Detecção Automática de Áudios
- O sistema detecta automaticamente quando uma mensagem de voz é recebida
- Diferencia entre mensagens de texto e áudio automaticamente

### ✅ Download e Conversão
- Faz download do arquivo de áudio enviado (formato OGG/Opus)
- Converte para MP3 usando FFmpeg com configurações otimizadas para voz:
  - Mono (1 canal)
  - 16kHz de frequência
  - 64k de bitrate

### ✅ Transcrição com OpenAI Whisper
- Utiliza o modelo Whisper-1 da OpenAI para transcrição
- Configurado para português (pt)
- Suporte a múltiplos formatos de áudio

### ✅ Integração Transparente
- O texto transcrito é processado como uma mensagem normal
- Mantém o contexto da conversa
- Responde baseado no conteúdo do áudio

### ✅ Feedback Visual
- Indicadores de status no WhatsApp:
  - 🎙️ "Recording" durante download
  - ✍️ "Typing" durante transcrição e processamento
- Confirmação da transcrição antes da resposta

## Limitações e Validações

### Duração Máxima
- **Limite:** 30 segundos por áudio
- **Motivo:** Otimização de performance e custo

### Tamanho do Arquivo
- **Limite:** 25MB (limite da API OpenAI)
- **Validação:** Verificação automática antes do envio

### Formatos Suportados
- Entrada: OGG/Opus (padrão WhatsApp)
- Processamento: MP3
- Suporte OpenAI: MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM

## Fluxo de Processamento

```
1. 📱 Usuário envia áudio no WhatsApp
2. 🔍 Sistema detecta mensagem de áudio
3. ⏱️ Verifica duração (máx 30s)
4. 📥 Baixa arquivo de áudio
5. 🔄 Converte OGG para MP3
6. 🤖 Envia para OpenAI Whisper
7. 📝 Recebe transcrição em texto
8. ✅ Confirma transcrição ao usuário
9. 🧠 Processa texto no assistente
10. 💬 Envia resposta baseada no áudio
```

## Tratamento de Erros

### Mensagens de Erro Específicas
- **FFmpeg não instalado:** "⚠️ Sistema de transcrição indisponível. O FFmpeg não está instalado no servidor. Por favor, envie sua mensagem em texto."
- **Áudio muito longo:** "⚠️ Áudio muito longo. Por favor, envie um áudio de até 30 segundos."
- **Arquivo muito grande:** "Arquivo muito grande."
- **Formato não suportado:** "Formato de áudio não suportado."
- **Timeout:** "Tempo esgotado. Tente com um áudio mais curto."
- **Erro geral:** "Tente novamente ou envie uma mensagem de texto."

### Logs Detalhados
- Download de áudio
- Processo de conversão
- Transcrição
- Erros específicos para diagnóstico

## Gerenciamento de Arquivos Temporários

### Limpeza Automática
- Arquivos temporários são removidos após cada processamento
- Limpeza automática a cada 30 minutos para arquivos antigos
- Diretório: `temp/` (ignorado pelo Git)

### Estrutura de Arquivos
```
temp/
├── {timestamp}_whatsapp_audio.ogg  (original)
└── {timestamp}_whatsapp_audio.mp3  (convertido)
```

## Dependências Adicionadas

```json
{
  "fluent-ffmpeg": "^2.1.2",     // Conversão de áudio
  "form-data": "^4.0.0",         // Upload para OpenAI
  "fs-extra": "^11.1.1"          // Operações de arquivo
}
```

## Requisitos do Sistema

### FFmpeg (OBRIGATÓRIO)
- **Necessário:** FFmpeg deve estar instalado no sistema
- **Status:** Verificação automática na inicialização
- **Instalação:**
  - **Windows:** Ver [`install-ffmpeg-windows.md`](install-ffmpeg-windows.md)
  - **Linux:** `sudo apt install ffmpeg`
  - **macOS:** `brew install ffmpeg`
- **Verificação:** Execute `ffmpeg -version` no terminal

### Variáveis de Ambiente
- `OPENAI_API_KEY`: Mesma chave já utilizada pelo assistente
- Não requer configurações adicionais

## Exemplo de Uso

### Input (Áudio)
```
👤 Usuário: [envia áudio: "Oi, quais são os débitos do CPF 123.456.789-00?"]
```

### Output (Sistema)
```
🤖 Bot: 🎤 Transcrevi seu áudio: "Oi, quais são os débitos do CPF 123.456.789-00?"

🤖 Bot: Vou consultar os débitos para o CPF informado...
[resposta normal do assistente]
```

## Monitoramento

### Logs de Acompanhamento
```javascript
// Áudio recebido
logger.info(`Áudio recebido de ${senderName}: ${duration}s`);

// Download
logger.info(`Áudio baixado: ${audioBuffer.length} bytes`);

// Transcrição
logger.info(`Transcrição concluída: "${transcription}"`);

// Resposta
logger.info(`Resposta ao áudio enviada para ${senderName}`);
```

## Performance

### Otimizações Implementadas
- Conversão para mono (reduz tamanho)
- Bitrate otimizado para voz (64k)
- Frequência otimizada (16kHz)
- Limpeza automática de arquivos
- Timeout configurável

### Tempo Médio de Processamento
- Download: 1-3 segundos
- Conversão: 1-2 segundos
- Transcrição: 3-8 segundos
- **Total:** 5-13 segundos (áudio de 10-30s)

## Segurança

### Arquivos Temporários
- Armazenados apenas durante processamento
- Removidos automaticamente após uso
- Diretório temp/ não versionado no Git

### Validações
- Verificação de duração antes do processamento
- Validação de tamanho de arquivo
- Timeout para evitar travamentos
