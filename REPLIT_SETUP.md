# Configuração do WhatsApp Bot no Replit

## 🚀 Configuração Automática

Este projeto inclui configuração automática para Replit com todas as dependências necessárias, incluindo **FFmpeg** para transcrição de áudios.

## 📋 Pré-requisitos

1. **Conta Replit** ativa
2. **Conta OpenAI** com API key
3. **Assistant OpenAI** configurado (veja [`ASSISTANT_FUNCTIONS.md`](ASSISTANT_FUNCTIONS.md))
4. **Acesso às APIs** municipais (Ábaco, SOAP)

## 🛠️ Passo a Passo

### 1. Importar o Projeto

- Acesse https://replit.com
- Clique em "Create Repl"
- Selecione "Import from GitHub"
- Cole a URL do repositório

### 2. Configurar Variáveis de Ambiente

No painel lateral do Replit, acesse **"Secrets"** e adicione:

```env
OPENAI_API_KEY=sua_chave_openai_aqui
OPENAI_ASSISTANT_ID=seu_assistant_id_aqui
ABACO_API_KEY=sua_chave_abaco_aqui
```

### 3. Reconstruir o Ambiente

**Opção A - Normal:**
No **Shell** do Replit, execute:

```bash
# Recarregar ambiente com novas dependências
exit
# Aguarde a reconstrução automática
```

**Opção B - Se houve erro de build Nix:**

```bash
# Aplicar correção automática
chmod +x fix-replit-nix.sh
./fix-replit-nix.sh

# Ou corrigir manualmente
cp replit-minimal.nix replit.nix
exit
```

### 4. Verificar Instalação

Execute no shell:

```bash
# Verificar FFmpeg
ffmpeg -version

# Testar configuração completa
node test-ffmpeg.js
```

### 5. Configurar OpenAI Assistant

Siga as instruções em [`ASSISTANT_FUNCTIONS.md`](ASSISTANT_FUNCTIONS.md) para configurar as funções necessárias.

### 6. Executar o Bot

```bash
npm start
```

### 7. Conectar WhatsApp

1. Escaneie o QR Code que aparece no console
2. Aguarde confirmação da conexão
3. Teste enviando uma mensagem

## 📁 Arquivos de Configuração

### `replit.nix`

Define as dependências do sistema:

- Node.js 20
- FFmpeg (para transcrição)
- Git, curl, wget

### `.replit`

Configura execução e portas:

- Comando de execução: `npm start`
- Porta 3000 mapeada para 80
- Configurações de linguagem

### `setup-replit.sh`

Script de configuração automática:

- Verifica FFmpeg e Node.js
- Instala dependências npm
- Testa configuração de transcrição

### `test-ffmpeg.js`

Script de teste específico:

- Valida FFmpeg
- Testa serviço de transcrição
- Diagnóstica problemas

### `replit-minimal.nix`

Configuração de backup minimalista:

- Para casos de erro de build Nix
- Versão simplificada e estável

### `fix-replit-nix.sh`

Script de correção automática:

- Corrige erros de build Nix
- Aplica configuração minimalista
- Faz backup da configuração original

## 🎤 Transcrição de Áudios

### Características

- **Formatos suportados**: OGG/Opus → MP3
- **Duração máxima**: 30 segundos
- **Tamanho máximo**: 25MB
- **Idioma**: Português (configurado automaticamente)

### Fluxo de Processamento

1. 📱 Usuário envia áudio no WhatsApp
2. 📥 Bot baixa o arquivo OGG
3. 🔄 Converte OGG para MP3 (FFmpeg)
4. 🤖 Envia para OpenAI Whisper
5. 📝 Recebe transcrição em texto
6. ✅ Confirma transcrição ao usuário
7. 🧠 Processa como mensagem normal

### Indicadores Visuais

- 🎙️ "Recording" - baixando áudio
- ✍️ "Typing" - transcrevendo e processando
- 📱 Mensagem de confirmação da transcrição

## 🔧 Solução de Problemas

### Erro de Build do Nix Environment

Se você ver erro como "couldn't get nix env building":

1. **Fazer backup da configuração** (opcional):

   ```bash
   mv replit.nix replit.nix.backup
   mv .replit .replit.backup
   ```

2. **Usar configuração minimalista**:

   ```bash
   # Criar replit.nix simples
   cat > replit.nix << 'EOF'
   { pkgs }: {
     deps = [
       pkgs.nodejs
       pkgs.ffmpeg
     ];
   }
   EOF
   ```

3. **Recarregar ambiente**:

   - Use "Shell" → "Kill shell" → Aguardar recriação
   - Ou clique em "Restart Repl" se disponível

4. **Testar instalação**:
   ```bash
   ffmpeg -version
   node test-ffmpeg.js
   ```

### FFmpeg não encontrado

```bash
# Verificar se replit.nix existe
ls -la replit.nix

# Recarregar ambiente
exit

# Testar novamente
ffmpeg -version
```

### Transcrição não funciona

```bash
# Executar diagnóstico
node test-ffmpeg.js

# Verificar logs do bot
npm start
# Olhar mensagens de erro específicas
```

### Variáveis de ambiente

```bash
# Verificar se estão definidas
echo $OPENAI_API_KEY
echo $OPENAI_ASSISTANT_ID

# Se vazias, configure no painel Secrets
```

### Problemas de dependências

```bash
# Limpar e reinstalar
rm -rf node_modules package-lock.json
npm install

# Ou usar npm cache
npm cache clean --force
npm install
```

## 🚦 Always On

Para manter o bot funcionando continuamente:

1. **Upgrade para Replit Core** (se necessário)
2. **Ativar "Always On"** no painel do projeto
3. **Configurar "Autoscale"** se disponível
4. **Monitorar logs** regularmente

## 📊 Monitoramento

### Logs Importantes

- Conexão WhatsApp: `Bot conectado ao WhatsApp com sucesso!`
- FFmpeg: `FFmpeg disponível no sistema`
- Transcrição: `Transcrição concluída: "..."`
- Erros: Mensagens específicas por tipo de problema

### Comandos de Diagnóstico

```bash
# Status geral
node test-ffmpeg.js

# Verificar processos
ps aux | grep node

# Verificar uso de disco
df -h

# Verificar logs em tempo real
npm start | grep -E "(INFO|ERROR|WARN)"
```

## 🔐 Segurança

### Variáveis de Ambiente

- ✅ Use sempre **Secrets** do Replit
- ❌ Nunca coloque chaves no código
- ✅ Verifique se `.env` está no `.gitignore`

### Arquivos Temporários

- Áudios são **removidos automaticamente**
- Limpeza a **cada 30 minutos**
- Diretório `temp/` **não é versionado**

## 📞 Suporte

### Problemas Comuns

1. **QR Code não aparece**: Verifique logs de conexão
2. **Bot não responde**: Verifique OpenAI API key
3. **Áudio não transcreve**: Verifique FFmpeg
4. **Replit trava**: Reinicie o ambiente

### Recursos Adicionais

- 📖 [Documentação Baileys](https://github.com/WhiskeySockets/Baileys)
- 🤖 [OpenAI API Docs](https://platform.openai.com/docs)
- 🔧 [Replit Docs](https://docs.replit.com)

---

_Configuração otimizada para Replit com suporte completo a transcrição de áudios_
