require('dotenv').config();
const AudioTranscriptionService = require('./src/audio-transcription-service');
const path = require('path');
const fs = require('fs');

async function test() {
  console.log('=== TESTE DE TRANSCRIÇÃO ===');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Configurada' : 'NÃO CONFIGURADA');
  
  try {
    const service = new AudioTranscriptionService();
    
    // Criar um arquivo de áudio de teste pequeno (vazio por enquanto)
    const testBuffer = Buffer.alloc(1000); // 1KB vazio
    
    console.log('Tentando processar áudio de teste...');
    const result = await service.processAudio(testBuffer, 'test_audio');
    console.log('Resultado:', result);
    
  } catch (error) {
    console.log('=== ERRO DETALHADO ===');
    console.log('Mensagem:', error.message);
    console.log('Tipo:', error.constructor.name);
    console.log('Código:', error.code);
    console.log('Stack:', error.stack);
    
    if (error.response) {
      console.log('Status HTTP:', error.response.status);
      console.log('Headers:', error.response.headers);
      console.log('Data:', error.response.data);
    }
    
    console.log('Objeto error completo:', error);
  }
}

test();
