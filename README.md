# API Key Management System

Sistema completo de gerenciamento de API Keys com recursos de assinatura e dashboard integrado.

**Autor:** @MutanoX
**Versão:** 1.0.0

## 📋 Recursos

### Recursos Principais
- ✅ Gerenciamento completo de API Keys (CRUD)
- ✅ Sistema de assinatura com expiração e renovação automática
- ✅ Autenticação de admin com tokens JWT
- ✅ Dashboard HTML integrado (arquivo único)
- ✅ Estatísticas e relatórios em tempo real
- ✅ Rastreamento de uso e logs de auditoria
- ✅ Histórico de pagamentos
- ✅ Banco de dados em arquivos JSON (sem necessidade de servidor de banco)

### Recursos de Segurança
- 🔒 Autenticação JWT
- 🔒 Rate limiting (por IP e API key)
- 🔒 Headers de segurança (CSP, HSTS, X-Frame-Options)
- 🔒 Sanitização e validação de inputs
- 🔒 Token blacklist
- 🔒 Proteção contra força bruta no login
- 🔒 Logout automático por inatividade (15 minutos)

### Recursos do Dashboard
- 📊 Estatísticas em tempo real
- 🔑 Gerenciamento de API Keys
- 💳 Gerenciamento de assinaturas
- 💰 Relatórios de receita
- 📜 Logs de atividade
- ⚙️ Configuração do sistema

## 🗄️ Banco de Dados

O sistema usa **arquivos JSON** armazenados na pasta `database/`:
- `api-keys.json` - Todas as API keys
- `subscriptions.json` - Assinaturas ativas
- `payments.json` - Histórico de pagamentos
- `usage-logs.json` - Logs de uso
- `audit-logs.json` - Logs de auditoria
- `jwt-blacklist.json` - Tokens invalidados
- `db-info.json` - Informações do banco

**Vantagens:**
- Sem necessidade de servidor de banco de dados
- Fácil backup (basta copiar a pasta)
- Versionamento nativo com Git
- Deploy simplificado

## 🚀 Instalação

### Pré-requisitos
- Bun ou Node.js 18+

### Passos de Instalação

1. **Instalar dependências**
```bash
npm install
# ou
bun install
```

2. **Configurar variáveis de ambiente (opcional)**

Crie um arquivo `.env` na raiz (opcional, já existem valores padrão):
```env
PORT=3000
```

**Nota:** Não é necessário configurar `JWT_SECRET` ou `CRON_SECRET`, pois já estão embutidos no código.

3. **Criar API Key admin (seeds)**
```bash
bun run seed
```

**Importante:** A API key admin será `MutanoX3397`

4. **Iniciar o servidor**
```bash
bun run dev
# ou
npm run dev
```

O servidor vai rodar em `http://localhost:3000`

## 📡 API Endpoints

### Autenticação

#### `POST /api/admin/auth/validate`
Valida API key de admin e retorna token JWT.

**Request:**
```json
{
  "apiKey": "MutanoX3397"
}
```

**Response:**
```json
{
  "valid": true,
  "token": "jwt_token_aqui",
  "refreshToken": "refresh_token_aqui",
  "expiresIn": 3600,
  "apiKey": {
    "uid": "...",
    "name": "...",
    "type": "admin"
  }
}
```

#### `GET /api/admin/auth/refresh`
Renova token JWT usando refresh token.

#### `DELETE /api/admin/auth/logout`
Logout e invalida token atual.

### Gerenciamento de API Keys

#### `POST /api/admin/keys`
Cria nova API key.

**Request:**
```json
{
  "name": "Cliente X",
  "type": "normal",
  "subscription": {
    "enabled": true,
    "price": 50,
    "durationDays": 30,
    "autoRenew": false
  }
}
```

#### `GET /api/admin/keys`
Lista todas as API keys.

#### `GET /api/admin/keys/{uid}`
Obtém informações detalhadas da API key.

#### `PUT /api/admin/keys/{uid}`
Atualiza API key.

#### `DELETE /api/admin/keys/{uid}`
Deleta API key.

### Gerenciamento de Assinaturas

#### `POST /api/admin/keys/{uid}/subscription/activate`
Ativa assinatura para API key.

#### `POST /api/admin/keys/{uid}/subscription/renew`
Renova assinatura.

#### `POST /api/admin/keys/{uid}/subscription/cancel`
Cancela assinatura (desativa renovação automática).

### Estatísticas e Relatórios

#### `GET /api/admin/stats`
Obtém estatísticas gerais do sistema.

#### `GET /api/admin/subscriptions/expiring`
Lista assinaturas expirando em breve.

#### `GET /api/admin/subscriptions/revenue`
Relatório de receita.

### Manutenção

#### `POST /api/cron/maintenance`
Executa tarefas de manutenção.

## 🎨 Dashboard

Acesse o dashboard em: `http://localhost:3000/api/dashboard/apikeys`

### Seções do Dashboard

1. **Visão Geral**
   - Total de keys, assinaturas ativas, receita, requisições
   - Timeline de atividade recente

2. **API Keys**
   - Listar todas as keys com busca
   - Criar novas keys com assinatura opcional
   - Ver detalhes, atualizar e deletar

3. **Assinaturas**
   - Listar todas as assinaturas
   - Filtrar por status
   - Renovar assinaturas

4. **Receita**
   - Cards de receita
   - Histórico de pagamentos

5. **Logs**
   - Timeline de atividade
   - Todas as ações admin registradas

6. **Configurações**
   - Configuração do sistema
   - URL da API
   - Intervalo de atualização

## 🔐 Uso de API Keys

Use suas API keys em requisições adicionando o header `X-API-Key`:

```bash
curl -H "X-API-Key: MutanoX3397" http://localhost:3000/api/admin/stats
```

### Expiração de Assinatura

Quando uma assinatura expira:
- API key é automaticamente desativada
- Todas as requisições retornam 402 Payment Required
- Headers incluem status da assinatura e dias restantes

## 🔧 Manutenção

### Manutenção Automática

Execute o endpoint de manutenção periodicamente:

```bash
curl -X POST http://localhost:3000/api/cron/maintenance
```

### O que a Manutenção Faz

1. **Verificar Assinaturas Expiradas**
   - Encontra assinaturas passadas da data final
   - Atualiza status para "expired"
   - Desativa API keys associadas
   - Cria logs de auditoria

2. **Limpar Tokens Antigos**
   - Remove tokens expirados da blacklist
   - Limpa arquivos JSON

## 📦 Estrutura do Projeto

```
api-keys-system/
├── database/                  # Arquivos JSON do banco de dados
│   ├── api-keys.json
│   ├── subscriptions.json
│   ├── payments.json
│   ├── usage-logs.json
│   ├── audit-logs.json
│   ├── jwt-blacklist.json
│   └── db-info.json
├── index.ts                  # Servidor Express principal
├── seed.ts                   # Script para criar API key admin
├── dashboard.html             # Dashboard HTML completo
├── package.json              # Dependências do projeto
├── .env.example             # Exemplo de variáveis (opcional)
└── README.md                # Este arquivo
```

## 🚨 Segurança

### Rate Limiting

- Endpoints públicos: 100 requisições/minuto
- Endpoints de API key: 1000 requisições/minuto
- Endpoints admin: 500 requisições/minuto
- Login: 5 tentativas a cada 15 minutos

### Headers de Segurança

Todas as respostas incluem:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy`
- `Strict-Transport-Security`

## 💾 Backup

Para fazer backup do sistema:

```bash
# Copiar toda a pasta
cp -r api-keys-system api-keys-system-backup-$(date +%Y%m%d)

# Ou apenas o banco de dados
tar -czf database-backup-$(date +%Y%m%d).tar.gz database/
```

## 📦 Deployment

Para produção:

1. **Copiar arquivos para o servidor**

2. **Instalar dependências**
```bash
bun install
```

3. **Executar seed para criar admin key**
```bash
bun run seed
```

4. **Iniciar o servidor**
```bash
PORT=3000 bun start
# ou
NODE_ENV=production bun index.ts
```

5. **Configurar PM2 (opcional, para manter rodando)**
```bash
pm2 start index.ts --name "api-keys-system" --watch
pm2 save
pm2 startup
```

6. **Configurar cron job para manutenção**

Adicionar ao crontab (roda diariamente à meia-noite):
```
0 0 * * * curl -X POST http://seu-dominio.com/api/cron/maintenance
```

## 🔄 Migrando de Prisma para JSON

Se você já usava o sistema com Prisma:

1. **Fazer backup dos dados existentes**

2. **Remover arquivos do Prisma**
```bash
rm -rf prisma/
rm schema.prisma
```

3. **Atualizar dependências**
```bash
bun install
```

4. **Criar nova estrutura**
```bash
mkdir -p database
bun run seed
```

5. **Iniciar o novo sistema**
```bash
bun run dev
```

## 🤝 Suporte

Para questões ou problemas, contate @MutanoX.

## 📄 Licença

Este projeto é privado e proprietário.

---

**Criado com ❤️ por @MutanoX**
