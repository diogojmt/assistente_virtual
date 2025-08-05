const TextNormalizer = require('./src/text-normalizer');

// Criar instância do normalizador
const normalizer = new TextNormalizer();

// Casos de teste comuns em transcrições de áudio
const testCases = [
  {
    name: "CPF com pontos e traços",
    input: "Meu CPF é 123.456.789-01",
    expected: "Meu CPF é 12345678901"
  },
  {
    name: "CPF com espaços (pausas na fala)",
    input: "CPF 123 456 789 01",
    expected: "CPF 12345678901"
  },
  {
    name: "CNPJ com formatação",
    input: "CNPJ da empresa: 12.345.678/0001-90",
    expected: "CNPJ da empresa: 12345678000190"
  },
  {
    name: "Telefone com espaços e traços",
    input: "Telefone: 11 9-8765-4321",
    expected: "Telefone: 11987654321"
  },
  {
    name: "CEP com traço",
    input: "CEP: 01234-567",
    expected: "CEP: 01234567"
  },
  {
    name: "Múltiplos números no texto",
    input: "CPF 123.456.789-01 telefone 11 98765-4321",
    expected: "CPF 12345678901 telefone 11987654321"
  },
  {
    name: "Protocolo com pontos",
    input: "Protocolo número 2023.12.345.678",
    expected: "Protocolo número 202312345678"
  },
  {
    name: "RG com traços",
    input: "RG: 12-345-678-9",
    expected: "RG: 123456789"
  },
  {
    name: "Valor decimal (deve preservar)",
    input: "O valor é R$ 123,45",
    expected: "O valor é R$ 123,45"
  },
  {
    name: "Número simples (deve preservar)",
    input: "Tenho 25 anos",
    expected: "Tenho 25 anos"
  },
  {
    name: "Texto sem números",
    input: "Olá, como você está?",
    expected: "Olá, como você está?"
  }
];

console.log('=== TESTE DO NORMALIZADOR DE TEXTO ===\n');

let passedTests = 0;
let failedTests = 0;

testCases.forEach((testCase, index) => {
  console.log(`Teste ${index + 1}: ${testCase.name}`);
  console.log(`Entrada:   "${testCase.input}"`);
  
  const result = normalizer.normalizeText(testCase.input);
  console.log(`Resultado: "${result}"`);
  console.log(`Esperado:  "${testCase.expected}"`);
  
  const passed = result === testCase.expected;
  if (passed) {
    console.log('✅ PASSOU\n');
    passedTests++;
  } else {
    console.log('❌ FALHOU\n');
    failedTests++;
  }
});

console.log('=== RESUMO DOS TESTES ===');
console.log(`✅ Passou: ${passedTests}`);
console.log(`❌ Falhou: ${failedTests}`);
console.log(`📊 Total: ${testCases.length}`);

if (failedTests === 0) {
  console.log('\n🎉 Todos os testes passaram!');
} else {
  console.log(`\n⚠️  ${failedTests} teste(s) falharam. Verifique a implementação.`);
}

// Teste específico para detecção de necessidade de normalização
console.log('\n=== TESTE DE DETECÇÃO ===');
const detectionTests = [
  { text: "CPF 123.456.789-01", shouldNeed: true },
  { text: "Olá mundo", shouldNeed: false },
  { text: "Telefone 11 98765-4321", shouldNeed: true },
  { text: "Tenho 25 anos", shouldNeed: false }
];

detectionTests.forEach(test => {
  const needs = normalizer.needsNormalization(test.text);
  const correct = needs === test.shouldNeed;
  console.log(`"${test.text}" - Precisa: ${needs} (esperado: ${test.shouldNeed}) ${correct ? '✅' : '❌'}`);
});

console.log('\n=== EXEMPLOS DE NORMALIZAÇÃO ===');
normalizer.showNormalizationExample();
