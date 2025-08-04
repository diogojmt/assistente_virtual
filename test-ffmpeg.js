#!/usr/bin/env node

/**
 * Script de teste para verificar se FFmpeg está disponível
 * Use este script no Replit para validar a configuração
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function testFFmpeg() {
  console.log('🔍 Testando disponibilidade do FFmpeg...\n');
  
  try {
    // Testar se FFmpeg está no PATH
    const { stdout } = await execAsync('ffmpeg -version');
    
    console.log('✅ FFmpeg está disponível!');
    console.log('📋 Versão:', stdout.split('\n')[0]);
    
    // Testar FFprobe também
    try {
      const { stdout: probeOutput } = await execAsync('ffprobe -version');
      console.log('✅ FFprobe está disponível!');
      console.log('📋 Versão:', probeOutput.split('\n')[0]);
    } catch (probeError) {
      console.log('⚠️  FFprobe não encontrado, mas FFmpeg está OK');
    }
    
    console.log('\n🎉 Sistema pronto para transcrição de áudios!');
    return true;
    
  } catch (error) {
    console.log('❌ FFmpeg não encontrado!');
    console.log('📝 Erro:', error.message);
    
    console.log('\n🔧 Para corrigir no Replit:');
    console.log('1. Verifique se o arquivo replit.nix existe');
    console.log('2. Execute "Reload Environment" no Replit');
    console.log('3. Aguarde a reconstrução do ambiente');
    console.log('4. Execute este teste novamente');
    
    return false;
  }
}

async function testAudioService() {
  console.log('\n🧪 Testando serviço de transcrição...\n');
  
  try {
    const AudioTranscriptionService = require('./src/audio-transcription-service');
    const audioService = new AudioTranscriptionService();
    
    // Aguardar verificação do FFmpeg
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (audioService.ffmpegAvailable) {
      console.log('✅ Serviço de transcrição inicializado com sucesso!');
      console.log('📁 Diretório temporário:', audioService.tempDir);
      return true;
    } else {
      console.log('❌ Serviço de transcrição não disponível');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro ao testar serviço:', error.message);
    return false;
  }
}

async function main() {
  console.log('🤖 Teste de Configuração do WhatsApp Bot - Replit\n');
  console.log('='.repeat(50));
  
  const ffmpegOk = await testFFmpeg();
  
  if (ffmpegOk) {
    await testAudioService();
    
    console.log('\n✨ Configuração completa!');
    console.log('📱 O bot está pronto para receber áudios do WhatsApp');
    
  } else {
    console.log('\n⚠️  Configuração incompleta');
    console.log('🔧 Siga as instruções acima para corrigir');
  }
  
  console.log('\n' + '='.repeat(50));
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testFFmpeg, testAudioService };
