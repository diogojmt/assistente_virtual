# 🔧 Troubleshooting - Resposta em Áudio

## 🎯 Guia de Resolução de Problemas

### ❌ Problema: "Áudio não chega ao usuário" (REPLIT)

**Sintomas:**
- Log mostra "✅ Áudio enviado com sucesso"
- Usuário não recebe o áudio no WhatsApp
- Sem mensagens de erro
- **Específico do Replit**: Limitações de recursos e largura de banda

**Diagnóstico nos Logs:**
```bash
# Procurar por estas linhas nos logs:
📤 Enviando áudio: audio.mp3 (139.7KB, audio/mpeg)
✅ Áudio enviado como PTT - ID: [message_id]
```

**Soluções Implementadas (REPLIT OTIMIZADO):**
1. ✅ **Múltiplas tentativas de envio** (PTT → Arquivo → Caminho direto → MP3 básico)
2. ✅ **Formato MP3** (mais compatível que Opus)
3. ✅ **Validação de tamanho** (máximo 3MB no Replit vs 16MB local)
4. ✅ **Logs detalhados** para debug
5. ✅ **Otimizações Replit**: Timeout menor, limite de texto reduzido, speed 1.1x
6. ✅ **Envio via caminho**: Fallback específico para ambiente Replit

---

### 🚀 Limitações Específicas do Replit

#### ⚠️ **Recursos Limitados:**
- **CPU/RAM**: Limitado pelo plano Replit
- **Largura de banda**: Pode afetar upload de áudio
- **Armazenamento**: Limitação de espaço temporário
- **Conexões simultâneas**: Limite de conexões de rede

#### 🔧 **Otimizações Implementadas:**
```javascript
// Limite de texto reduzido para produção
const maxLength = process.env.NODE_ENV === 'production' ? 2000 : 4096;

// Timeout menor no Replit
timeout: process.env.NODE_ENV === 'production' ? 20000 : 30000;

// Tamanho máximo menor
const maxSize = process.env.NODE_ENV === 'production' ? 3 * 1024 * 1024 : 16 * 1024 * 1024;

// Velocidade de fala aumentada para arquivos menores
speed: 1.1 // vs 1.0 padrão
```

#### 📋 **Estratégia de Envio Replit:**
1. **PTT otimizado** com configurações limpas
2. **Arquivo normal** como fallback
3. **Caminho direto** (específico Replit)
4. **MP3 mínimo** como último recurso

---

### 🔍 Como Debugar

#### 1. Verificar Logs em Tempo Real
```bash
# No ambiente Replit/produção
tail -f /var/log/app.log | grep -E "(📤|✅|❌|TTS)"

# Localmente
npm start | grep -E "(📤|✅|❌|TTS)"
```

#### 2. Verificar Arquivos Gerados
```bash
# Listar arquivos TTS criados
ls -la temp/tts_*

# Verificar tamanho dos arquivos
du -h temp/tts_*.mp3
```

#### 3. Logs Importantes para Analisar

**✅ Sucesso Completo:**
```
INFO: Processando solicitação de áudio de [Usuario]
INFO: Gerando áudio TTS - Tamanho: 77 chars, Voz: nova, Formato: mp3
INFO: Áudio TTS gerado com sucesso: temp/tts_xxx.mp3 (143040 bytes)
INFO: 📤 Enviando áudio: tts_xxx.mp3 (139.7KB, audio/mpeg)
INFO: ✅ Áudio enviado como PTT - ID: [message_id]
INFO: Áudio TTS enviado com sucesso para [Usuario]
```

**⚠️ Fallback para Arquivo:**
```
WARN: ❌ Falha no envio PTT, tentando como áudio normal: [erro]
INFO: ✅ Áudio enviado como arquivo - ID: [message_id]
```

**❌ Erro Crítico:**
```
ERROR: ❌ Erro crítico ao enviar áudio: [detalhes]
ERROR: Stack trace: [stack]
```

---

### 🛠️ Ações de Manutenção

#### Verificar Configuração OpenAI
```javascript
// Teste rápido da API
node -e "
require('dotenv').config();
console.log('API Key:', process.env.OPENAI_API_KEY ? 'Configurada' : 'Não configurada');
"
```

#### Verificar Espaço em Disco
```bash
# Verificar espaço disponível
df -h

# Verificar tamanho da pasta temp
du -sh temp/
```

#### Limpeza Manual de Arquivos
```bash
# Remover arquivos TTS antigos (mais de 1 hora)
find temp/ -name "tts_*" -mmin +60 -delete

# Verificar arquivos restantes
ls -la temp/
```

---

### 📋 Checklist de Verificação

#### ✅ Pré-requisitos
- [ ] OPENAI_API_KEY configurada no .env
- [ ] Bot conectado ao WhatsApp
- [ ] Pasta temp/ existe e tem permissões
- [ ] Espaço em disco disponível (> 100MB)

#### ✅ Fluxo Funcional
- [ ] Usuário recebe resposta em texto
- [ ] Bot pergunta sobre áudio automaticamente
- [ ] Usuário responde "áudio" ou 🎧
- [ ] Bot detecta solicitação (log: "Processando solicitação de áudio")
- [ ] TTS gera arquivo (log: "Áudio TTS gerado com sucesso")
- [ ] Arquivo é enviado (log: "✅ Áudio enviado")

#### ✅ Troubleshooting Específico
- [ ] Formato MP3 sendo usado (não Opus)
- [ ] Tamanho do arquivo < 16MB
- [ ] Mimetype correto (audio/mpeg)
- [ ] Message ID retornado pelo WhatsApp

---

### 🔄 Próximos Passos se Problema Persistir

1. **Testar com texto menor** (< 50 caracteres)
2. **Verificar se outros tipos de mídia funcionam** (imagens, vídeos)
3. **Testar em horários diferentes** (possível rate limiting)
4. **Verificar logs do Baileys** para erros de protocolo
5. **Considerar usar formato AAC** como alternativa

---

---

### 🔧 Correções Implementadas (Log Analisado)

#### ❌ **Problemas Identificados no Log:**
1. **Logs de erro vazios**: "ERROR: Erro ao adicionar mensagem à thread:"
2. **Thread OpenAI corrompida**: Falha ao adicionar mensagem
3. **Conexão WhatsApp instável**: Erro 503 com reconexão

#### ✅ **Soluções Implementadas:**

**1. Logs Detalhados:**
```javascript
// Antes: logs vazios
ERROR: Erro ao adicionar mensagem à thread:

// Agora: logs completos
❌ Erro ao adicionar mensagem à thread: Request failed with status 400
Stack trace: Error: Request failed...
Status HTTP: 400
Response data: {"error": {"message": "..."}}
```

**2. Gerenciamento Inteligente de Threads:**
- **Limite automático**: 20 mensagens no Replit (vs 50 local)
- **Limpeza preventiva**: Remove threads antes de corrompê-las
- **Retry automático**: Cria nova thread se a atual falhar
- **Estatísticas**: Monitoramento de threads ativas

**3. Tratamento de Erros Melhorado:**
- **Mensagens específicas** para cada tipo de erro
- **Retry automático** para threads corrompidas
- **Limpeza automática** a cada 30 minutos

---

### 📞 Suporte

**Se o problema persistir:**
1. Colete logs completos da sessão (agora mais detalhados)
2. Verifique estatísticas de threads: `📊 Threads ativas: X`
3. Observe limpezas automáticas: `🧹 X threads OpenAI limpas`
4. Teste com conta WhatsApp diferente

**Logs essenciais para suporte:**
- Log completo desde "Processando solicitação de áudio"
- Estatísticas de threads: `📊 Threads ativas`
- Erros detalhados com stack trace completo
- Resposta da API do WhatsApp (message IDs)
