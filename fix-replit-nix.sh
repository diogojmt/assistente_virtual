#!/bin/bash

# Script para corrigir problemas de build do Nix no Replit

echo "🔧 Aplicando correção para problema de build Nix..."

# Fazer backup da configuração atual
if [ -f "replit.nix" ]; then
    echo "📁 Fazendo backup da configuração atual..."
    cp replit.nix replit.nix.backup
    echo "✅ Backup criado: replit.nix.backup"
fi

# Aplicar configuração minimalista
echo "🔄 Aplicando configuração minimalista..."
cat > replit.nix << 'EOF'
{ pkgs }: {
  deps = [
    pkgs.nodejs
    pkgs.ffmpeg
  ];
}
EOF

echo "✅ Configuração minimalista aplicada"

# Verificar se .replit precisa de ajuste
if grep -q "stable-23.05" .replit 2>/dev/null; then
    echo "🔄 Corrigindo canal Nix em .replit..."
    sed -i 's/stable-23.05/stable-22_11/g' .replit
    echo "✅ Canal Nix corrigido"
fi

echo ""
echo "🎉 Correção aplicada com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie o shell: Shell → Kill shell"
echo "2. Aguarde a reconstrução do ambiente"
echo "3. Teste: ffmpeg -version"
echo "4. Execute: node test-ffmpeg.js"
echo ""
echo "🔙 Para restaurar configuração original:"
echo "   cp replit.nix.backup replit.nix"
