{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.ffmpeg
    pkgs.git
    pkgs.curl
    pkgs.wget
  ];
  
  env = {
    # Definir caminho do Node.js
    NODE_PATH = "${pkgs.nodejs_20}/lib/node_modules";
    
    # Garantir que FFmpeg esteja no PATH
    PATH = "${pkgs.ffmpeg}/bin:${pkgs.nodejs_20}/bin:$PATH";
  };
  
  # Scripts de configuração
  shellHook = ''
    echo "=== Ambiente Replit Configurado ==="
    echo "Node.js version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "FFmpeg version: $(ffmpeg -version | head -n1)"
    echo "================================="
    
    # Executar script de configuração se existir
    if [ -f "setup-replit.sh" ]; then
      chmod +x setup-replit.sh
      ./setup-replit.sh
    else
      # Configuração básica se script não existir
      if [ ! -d "node_modules" ]; then
        echo "Instalando dependências Node.js..."
        npm install
      fi
      
      echo "Ambiente pronto para WhatsApp Bot com transcrição de áudio!"
    fi
  '';
}
