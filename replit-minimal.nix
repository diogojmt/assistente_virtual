# Configuração minimalista para casos de erro
# Use este arquivo se o replit.nix principal falhar
# Renomeie para replit.nix se necessário

{ pkgs }: {
  deps = [
    pkgs.nodejs
    pkgs.ffmpeg
  ];
}
