# 🔧 Correção: Detecção de Áudio via Transcrição

## ❌ **Problema Identificado no Log:**

### **Situação:**
1. **Usuário solicita áudio via transcrição:**
   - `"Boa noite. Só responda em áudio, tá?"`
   - `"Responda em alto, por favor."`

2. **OpenAI responde que não pode fazer áudio:**
   - `"Atualmente, estou capacitado apenas para fornecer respostas em formato de texto"`

3. **Sistema TTS nunca é ativado**

## ✅ **Correção Implementada:**

### **1. Detecção de Áudio Expandida:**
```javascript
// Palavras-chave adicionadas:
const audioKeywords = [
  "audio", "áudio", "som", "escutar", "ouvir", "falar",
  "responda em áudio", "responda em alto", "só responda em áudio",
  "quero áudio", "em voz", "falando", "voz", "oral", "sonoro"
];
```

### **2. Verificação na Transcrição:**
```javascript
// Verificar se usuário pediu áudio na transcrição
const audioRequestType = this.isAudioRequest(normalizedTranscription);
if (audioRequestType === true) {
  // Ativar preferência automática
  this.audioPreferences.set(fromNumber, {
    preferAudio: true,
    timestamp: Date.now(),
    lastMessage: normalizedTranscription
  });
  logger.info("🎧 Usuário solicitou áudio via transcrição, ativando preferência automática");
}
```

### **3. Resultados dos Testes:**
✅ `"Boa noite. Só responda em áudio, tá?"` → **DETECTADO**
✅ `"Responda em alto, por favor."` → **DETECTADO**
✅ `"quero áudio"` → **DETECTADO**
✅ `"responda falando"` → **DETECTADO**
✅ `"em voz por favor"` → **DETECTADO**
✅ `🎧` → **DETECTADO**

## 🎯 **Como Funciona Agora:**

### **Fluxo Corrigido:**
```
1. Usuário (ÁUDIO): 🎤 "Só responda em áudio, tá?"
2. Sistema TRANSCREVE: "Só responda em áudio, tá?"
3. Sistema DETECTA: audioRequestType = true
4. Sistema ATIVA: Preferência automática por 1 hora
5. OpenAI PROCESSA: Pergunta sobre débito
6. Sistema GERA: Áudio automaticamente
7. Sistema ENVIA: 🔊 Resposta em áudio
```

## ⚠️ **Problema Restante:**

### **Assistant OpenAI Desatualizado:**
O Assistant ainda responde: *"não sou capaz de responder em formato de áudio"*

**Solução Necessária:**
- Atualizar instruções do Assistant OpenAI para informar sobre capacidade TTS
- Instruir para não mencionar limitações de áudio
- Focar apenas na resposta à pergunta do usuário

## 📊 **Logs Esperados no Próximo Teste:**
```
INFO: 🎧 Usuário solicitou áudio via transcrição, ativando preferência automática
INFO: 🎧 Usuário prefere áudio, gerando automaticamente
INFO: 🎧 Gerando áudio automaticamente...
INFO: Gerando áudio TTS - Tamanho: X chars, Voz: nova, Formato: mp3
INFO: ✅ Áudio enviado como PTT - ID: [message_id]
```

## 🎉 **Status:**
- ✅ **Detecção de áudio**: CORRIGIDA
- ⚠️ **Instruções do Assistant**: PENDENTE (requer atualização manual)
- ✅ **Geração TTS**: FUNCIONANDO
- ✅ **Envio de áudio**: FUNCIONANDO

**A correção resolve o problema de detecção. O Assistant OpenAI precisa ser atualizado separadamente.**
