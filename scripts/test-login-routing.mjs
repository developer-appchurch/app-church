import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('TESTE DE VERIFICAÇÃO: ROTEAMENTO INICIAL PARA FEED DE NOTÍCIAS');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASSOU] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FALHOU] ${message}`);
  }
}

// 1. Inspeciona app/page.tsx
const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

// Teste 1: Estado inicial do activeScreen deve ser 'feed'
const initialStateMatch = pageContent.includes("useState<ActiveScreen>('feed')");
assert(initialStateMatch, "Estado padrão de activeScreen em app/page.tsx é 'feed'");

// Teste 2: Auto-login / Restauração da sessão no mount (0ms cache) deve definir 'feed'
const cachedSessionMatch = /const cached = AppChurchService\.getCachedUser\(\);[\s\S]*?setActiveScreen\('feed'\)/.test(pageContent);
assert(cachedSessionMatch, "Restauração de sessão instantânea (cache local) define activeScreen = 'feed'");

// Teste 3: Auto-login / Restauração de sessão assíncrona (Supabase Auth) deve definir 'feed'
const asyncSessionMatch = /const sessionUser = await AppChurchService\.getCurrentUser\(\);[\s\S]*?setActiveScreen\('feed'\)/.test(pageContent);
assert(asyncSessionMatch, "Restauração de sessão assíncrona (Supabase Auth) define activeScreen = 'feed'");

// Teste 4: Login manual (handleLoginSuccess) deve definir 'feed'
const handleLoginSuccessMatch = /const handleLoginSuccess = \([\s\S]*?setActiveScreen\('feed'\)/.test(pageContent);
assert(handleLoginSuccessMatch, "Função handleLoginSuccess define activeScreen = 'feed'");

// Teste 5: Logout (handleLogout) deve resetar para 'feed'
const handleLogoutMatch = /const handleLogout = async \(\) => {[\s\S]*?setActiveScreen\('feed'\)/.test(pageContent);
assert(handleLogoutMatch, "Função handleLogout redefine activeScreen = 'feed'");

// Teste 6: Inspeciona app/login/page.tsx
const loginPagePath = path.join(process.cwd(), 'app', 'login', 'page.tsx');
const loginPageContent = fs.readFileSync(loginPagePath, 'utf-8');
const loginRedirectMatch = loginPageContent.includes("router.replace('/')");
assert(loginRedirectMatch, "Página /login redireciona para a raiz '/' onde o Feed é montado");

// Teste 7: Inspeciona Sidebar.tsx - item de Feed presente no topo
const sidebarPath = path.join(process.cwd(), 'components', 'Sidebar.tsx');
const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
const sidebarFeedFirst = sidebarContent.includes("id: 'feed' as ActiveScreen,\n      label: 'Feed de Notícias'");
assert(sidebarFeedFirst, "Item 'Feed de Notícias' está configurado e acessível no Sidebar");

console.log('\n----------------------------------------------------------------');
console.log(`Resultado: ${passedTests}/${totalTests} testes passaram com sucesso!`);
console.log('----------------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
