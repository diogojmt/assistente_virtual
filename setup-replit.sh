#!/bin/bash

# Script de configuração inicial para Replit
# Este script é executado automaticamente pelo replit.nix

echo "🔧 Configurando ambiente Replit para WhatsApp Bot..."

# Verificar se FFmpeg está disponível
if command -v ffmpeg >/dev/null 2>&1; then
    echo "✅ FFmpeg disponível: $(ffmpeg -version | head -n1)"
else
    echo "❌ FFmpeg não encontrado! Verifique o replit.nix"
    exit 1
fi

# Verificar se Node.js está disponível
if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js disponível: $(node --version)"
else
    echo "❌ Node.js não encontrado!"
    exit 1
fi

# Criar diretório temporário se não existir
mkdir -p temp
echo "📁 Diretório temporário criado: temp/"

# Verificar se as dependências Node.js estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências Node.js..."
    npm install
else
    echo "✅ Dependências Node.js já instaladas"
fi

# Testar configuração de transcrição
echo "🧪 Testando configuração de transcrição..."
if node test-ffmpeg.js; then
    echo "✅ Configuração de transcrição OK"
else
    echo "⚠️ Problemas na configuração de transcrição"
fi

echo ""
echo "🎉 Configuração Replit concluída!"
echo "📝 Para usar o bot:"
echo "   1. Configure as variáveis de ambiente (Secrets)"
echo "   2. Execute: npm start"
echo "   3. Escaneie o QR Code no WhatsApp"
echo ""
echo "🔍 Para verificar FFmpeg: ffmpeg -version"
echo "🧪 Para testar transcrição: node test-ffmpeg.js"
