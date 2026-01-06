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

## 🚀 Instalação

### Pré-requisitos
- Node.js 18+ ou Bun
- SQLite (incluso)

### Passos de Instalação

1. **Instalar dependências**
```bash
npm install
# ou
bun install
```

2. **Configurar variáveis de ambiente**

Copie `.env.example` para `.env` e configure:
```env
DATABASE_URL="file:./db/api-keys.db"
JWT_SECRET="your-secret-key-change-in-production"
CRON_SECRET="your-cron-secret-here"
PORT=3000
```

3. **Inicializar o banco de dados**
```bash
npx prisma db push
# ou
bun run db:push
```

4. **Criar API Key admin (seeds)**
```bash
bun run seed.ts
```

**Importante:** A API key admin será `MutanoX3397`

5. **Iniciar o servidor**
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
  "expiresIn": 3600
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
  "rateLimit": 1000,
  "rateLimitWindow": 3600000,
  "subscription": {
    "enabled": true,
    "price": 50,
    "durationDays": 30,
    "autoRenew": false
  }
}
```

#### `GET /api/admin/keys`
Lista todas as API keys com filtros.

**Query Params:**
- `status`: `active`, `inactive`, `all`
- `type`: `admin`, `normal`, `all`
- `hasSubscription`: `true`, `false`, `all`
- `search`: Buscar por nome ou UID
- `page`: Número da página (padrão: 1)
- `limit`: Itens por página (padrão: 20)

#### `GET /api/admin/keys/{keyOrUid}`
Obtém informações detalhadas da API key.

#### `PUT /api/admin/keys/{keyOrUid}`
Atualiza API key.

#### `DELETE /api/admin/keys/{keyOrUid}`
Deleta API key.

### Gerenciamento de Assinaturas

#### `POST /api/admin/keys/{keyOrUid}/subscription/activate`
Ativa assinatura para API key.

**Request:**
```json
{
  "price": 50,
  "durationDays": 30,
  "autoRenew": false,
  "currency": "BRL"
}
```

#### `POST /api/admin/keys/{keyOrUid}/subscription/renew`
Renova assinatura.

**Request:**
```json
{
  "durationDays": 30,
  "paymentReference": "REF-123456",
  "amount": 50
}
```

#### `POST /api/admin/keys/{keyOrUid}/subscription/cancel`
Cancela assinatura (desativa renovação automática).

### Estatísticas e Relatórios

#### `GET /api/admin/stats`
Obtém estatísticas gerais do sistema.

#### `GET /api/admin/subscriptions/expiring`
Lista assinaturas expirando em breve.

**Query Params:**
- `days`: Limite em dias (padrão: 7)
- `status`: `expiring`, `expired`, `all`

#### `GET /api/admin/subscriptions/revenue`
Relatório de receita.

**Query Params:**
- `startDate`: Data ISO8601
- `endDate`: Data ISO8601
- `groupBy`: `date`, `month`, `key`

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
curl -X POST \
  -H "Authorization: Bearer {CRON_SECRET}" \
  http://localhost:3000/api/cron/maintenance
```

### O que a Manutenção Faz

1. **Verificar Assinaturas Expiradas**
   - Encontra assinaturas passadas da data final
   - Atualiza status para "expired"
   - Desativa API keys associadas
   - Cria logs de auditoria

2. **Auto-Renovar Assinaturas**
   - Encontra assinaturas expirando em 24h
   - Estende pela duração padrão (30 dias)
   - Cria registros de pagamento
   - Cria logs de auditoria

3. **Limpar Tokens Antigos**
   - Remove tokens expirados da blacklist
   - Libera espaço no banco de dados

## 📦 Estrutura do Projeto

```
api-keys-system/
├── admin/                    # API admin endpoints
├── dashboard/                # Dashboard endpoint
├── cron/                     # Maintenance endpoint
├── api-keys/                 # API key utilities
│   ├── jwt.ts               # JWT functions
│   ├── maintenance.ts        # Maintenance tasks
│   └── utils.ts             # Utility functions
├── middleware/                # Middleware
│   ├── auth.ts              # Authentication
│   ├── rateLimit.ts         # Rate limiting
│   └── security.ts         # Security headers
├── dashboard.html            # Dashboard HTML
├── schema.prisma            # Database schema
├── seed.ts                 # Database seed
├── .env.example            # Environment variables example
└── README.md               # This file
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

## 🤝 Suporte

Para questões ou problemas, contate @MutanoX.

## 📄 Licença

Este projeto é privado e proprietário.

---

**Criado com ❤️ por @MutanoX**
