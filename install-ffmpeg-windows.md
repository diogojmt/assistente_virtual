# Instalação do FFmpeg no Windows

## Método 1: Download Manual (Recomendado)

### 1. Baixar FFmpeg
- Acesse: https://ffmpeg.org/download.html
- Clique em "Windows"
- Baixe a versão "release builds" (estática)
- Recomendado: https://github.com/BtbN/FFmpeg-Builds/releases

### 2. Extrair o Arquivo
- Extraia o arquivo ZIP baixado
- Exemplo: `C:\ffmpeg\`

### 3. Adicionar ao PATH
1. Abra "Configurações do Sistema"
2. Pesquise por "variáveis de ambiente"
3. Clique em "Editar as variáveis de ambiente do sistema"
4. Clique em "Variáveis de Ambiente"
5. Em "Variáveis do sistema", encontre "Path"
6. Clique em "Editar"
7. Clique em "Novo"
8. Adicione o caminho: `C:\ffmpeg\bin`
9. Clique "OK" em todas as janelas

### 4. Verificar Instalação
Abra um novo prompt de comando e execute:
```cmd
ffmpeg -version
```

## Método 2: Chocolatey

Se você tem o Chocolatey instalado:
```cmd
choco install ffmpeg
```

## Método 3: Winget (Windows 10/11)

```cmd
winget install ffmpeg
```

## Reiniciar o Bot

Após instalar o FFmpeg:
1. Feche o bot (Ctrl+C)
2. Execute novamente: `npm start`
3. Verifique nos logs se aparecer: "FFmpeg disponível no sistema"

## Testando Transcrição

Após a instalação:
1. Envie um áudio de até 30 segundos via WhatsApp
2. O bot deve responder com a transcrição
3. Em seguida, processará o conteúdo normalmente

## Solução de Problemas

### "Comando não reconhecido"
- Verifique se o PATH está correto
- Reinicie o prompt de comando
- Reinicie o computador se necessário

### "FFmpeg não encontrado no sistema"
- Confirme que `ffmpeg -version` funciona no cmd
- Reinicie o bot completamente

### Áudio não processa
- Verifique se o áudio tem menos de 30 segundos
- Teste com áudios menores primeiro
- Verifique os logs para erros específicos
