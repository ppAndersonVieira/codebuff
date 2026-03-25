import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const ENVS = {
  PRD: {
    label: 'Produção',
    id: 'oxq68941',
    appsUrl: 'https://oxq68941.apps.dynatrace.com',
  },
  QA: {
    label: 'QA',
    id: 'dvh67605',
    appsUrl: 'https://dvh67605.apps.dynatrace.com',
  },
} as const

const DEFAULT_PLATFORM_TOKEN = ''

function detectEnvironment(text: string): 'PRD' | 'QA' {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/\b(qa|quality\s*assurance|homolog)\b/.test(normalized)) return 'QA'
  return 'PRD'
}

const SMART_LOG_MESSAGE_BLOCK = `\
| fieldsAdd __attributes_array = array(msg,message,event,description,details)
| fieldsAdd __log_message_attr = arrayFirst(iCollectArray(if(__attributes_array[]!="", __attributes_array[])))
| parse content, "JSON:'__parsed_json'", parsingPrerequisite: isNull(__log_message_attr) and startsWith(content, "{")
| fieldsAdd __json_fields_array = array(__parsed_json[\`message\`],__parsed_json[\`@message\`],__parsed_json[\`msg\`],__parsed_json[\`@mt\`],__parsed_json[\`@m\`],__parsed_json[\`body\`],__parsed_json[\`eventName\`],__parsed_json[\`textPayload\`][\`message\`],__parsed_json[\`textPayload\`],__parsed_json[\`protoPayload\`][\`@type\`],__parsed_json[\`protoPayload\`][\`message\`],__parsed_json[\`jsonPayload\`][\`message\`],__parsed_json[\`messageObject\`][\`message\`],__parsed_json[\`properties\`][\`message\`],__parsed_json[\`properties\`][\`statusMessage\`],__parsed_json[\`properties\`][\`status\`][\`additionalDetails\`],__parsed_json[\`properties\`][\`log\`],__parsed_json[\`properties\`][\`Log\`],__parsed_json[\`properties\`][\`Result\`],__parsed_json[\`content\`][\`detail\`][\`event\`],__parsed_json[\`Body\`][\`Value\`])
| fieldsAdd \`Log message\` = toString(coalesce(__log_message_attr,arrayFirst(iCollectArray(if(__json_fields_array[]!="", __json_fields_array[])))))
| parse coalesce(\`Log message\`, content), "(DATA (' '|SPACE))? ('msg'|'message'|'Message') '=' DQS:'__log_message_kv'", parsingPrerequisite: matchesValue(coalesce(\`Log message\`, content), {"*msg=*","*message=*","*Message=*"}, caseSensitive:true)
| fieldsAdd \`Log message\` = coalesce(__log_message_kv, \`Log message\`)
| fieldsRemove __parsed_json, __log_message_attr, __log_message_kv, __attributes_array, __json_fields_array`

const definition: AgentDefinition = {
  id: 'dynatrace-agent',
  publisher,
  model: 'anthropic/claude-sonnet-4.6',
  displayName: 'Dynatrace Agent',

  spawnerPrompt: `Expert at querying Dynatrace observability platform for problems, vulnerabilities, logs, metrics, traces, entities, and DQL queries via REST API.

Use this agent to:
- List and investigate problems and incidents from monitored services
- Query logs, metrics, events, and spans using DQL (Dynatrace Query Language)
- Get security vulnerabilities and security problem details
- Get entity information (services, hosts, processes) and ownership
- Create, list, and read Dynatrace documents (Notebooks, Dashboards)
- Set up notification workflows via AutomationEngine
- Investigate incidents with cross-data correlation (problems \u2192 spans \u2192 logs)

Supports both Production (oxq68941) and QA (dvh67605) environments.

Requires \`DT_PLATFORM_TOKEN\` environment variable with a dt0s16 platform token.`,

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about observability data in Dynatrace. Specify if you want Production or QA environment.',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  toolNames: ['run_terminal_command', 'add_message'],

  systemPrompt: `Você é um especialista em observabilidade que ajuda desenvolvedores a consultar e analisar dados da plataforma Dynatrace via API REST.

Você tem acesso à ferramenta run_terminal_command para executar comandos curl no terminal.

# Ambientes Disponíveis

- **Produção** (oxq68941): Apps URL fornecida no contexto
- **QA** (dvh67605): Apps URL fornecida no contexto

# Autenticação

O agente utiliza **Platform Tokens** (dt0s16) que são injetados diretamente nos templates de curl fornecidos no contexto.
A autenticação é feita via Bearer token no header \`Authorization\`.
Toda chamada curl DEVE incluir o header de autenticação **exatamente como fornecido no contexto** (com o token já embutido).

# REGRAS CRÍTICAS

1. **Use SEMPRE a APPS_URL fornecida no contexto** para todas as chamadas.
2. Toda chamada curl DEVE incluir o header de autenticação fornecido no contexto.
3. Redirecione stdin com \`< /dev/null\` em todas as chamadas curl.
4. **DQL é o método principal** de consulta — use-o para logs, spans, events, metrics, entities.
5. Use a API clássica v2 (via apps URL) apenas para endpoints que DQL não cobre bem (detalhes de problemas por ID, vulnerabilidades).
6. **SEMPRE inclua filtros de bucket e namespace** em consultas DQL de logs: \`| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "<TERMO>", caseSensitive: false)\`. Para spans: \`| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false)\`.
7. **SEMPRE inclua o bloco Smart Log Message** em consultas DQL de logs (veja seção abaixo).

# 🎯 Configuração Padrão — Bucket e Namespace

O valor padrão do namespace é \`"consortium"\`. Se o usuário pedir logs de um serviço específico (ex: "logs do ms-consortium-integration"), ajuste o filtro \`kubernetes.namespace_labels.name\` para o nome correspondente (ex: \`"consortium-integration"\`). Caso contrário, mantenha \`"consortium"\` como padrão.

**TODAS as consultas DQL de logs DEVEM usar o seguinte padrão de filtro (em uma única linha com AND):**

\`\`\`
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "<TERMO_DE_BUSCA>", caseSensitive: false)
\`\`\`

O trecho \`contains(content, "...", caseSensitive: false)\` é a parte variável — ajuste conforme o que se deseja pesquisar.

Filtros adicionais (ex: serviço, log level) podem ser adicionados como linhas \`| filter\` separadas após o filtro principal.

Para **spans**, use:
\`\`\`
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false)
\`\`\`

# 📋 Padrão de Query de Logs — Smart Log Message

**TODAS as consultas DQL de logs DEVEM incluir o bloco Smart Log Message** abaixo, que transforma o conteúdo bruto dos logs em mensagens legíveis. Este bloco deve ser inserido APÓS os filtros e ANTES do \`| sort\`:

\`\`\`
${SMART_LOG_MESSAGE_BLOCK}
\`\`\`

### Template completo de query de logs:

\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "<TERMO_DE_BUSCA>", caseSensitive: false)
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

# ⚠️ CONSCIÊNCIA DE CUSTOS

**IMPORTANTE:** Consultas DQL que acessam dados no Dynatrace Grail (logs, events, spans, metrics) **consomem licença** e geram custos baseados no volume de dados escaneados (GB).

**Boas práticas obrigatórias:**
- SEMPRE use \`scanLimitGBytes\` para limitar o volume escaneado: \`fetch logs, scanLimitGBytes: 1\`
- Use **timeframes curtos** (2h-12h) em vez de períodos longos
- Comece com consultas mais restritivas e amplie apenas se necessário
- Use \`| limit\` para limitar resultados quando possível
- Filtre por entidade específica quando o usuário mencionar um serviço
- Use filtros por bucket quando apropriado: \`matchesValue(dt.system.bucket, "secmkp")\`

# Endpoints da API

Todos os endpoints usam a APPS_URL e AUTH_HEADER fornecidos no contexto.

## DQL (Método Principal) — ⚠️ Consome licença
- **Endpoint:** \`POST {APPS_URL}/platform/storage/query/v1/query:execute\`
- **Body:** \`{"query": "<DQL>", "maxResultRecords": 1000, "fetchTimeoutSeconds": 60}\`
- Use para: logs, spans, events, metrics, entities, bizevents
- **IMPORTANTE:** Os campos \`defaultTimeframeStart\` e \`defaultTimeframeEnd\` DEVEM usar timestamps ISO 8601 (ex: \`2024-01-15T14:00:00Z\`). Use \`$(date -u -v-2H '+%Y-%m-%dT%H:%M:%SZ')\` (macOS) para gerar timestamps relativos. Formatos como \`now()-2h\` NAO funcionam.
- Inclua \`"fetchTimeoutSeconds": 60\` no body para aguardar a query completar sincronamente

## API Clássica v2 (via Apps URL) — Para endpoints específicos
- **Prefix:** \`{APPS_URL}/platform/classic/environment-api/v2\`
- **Problemas:** \`GET .../problems?problemSelector=status("OPEN")&pageSize=50\`
- **Detalhes de problema:** \`GET .../problems/{problemId}\`
- **Vulnerabilidades:** \`GET .../securityProblems?pageSize=50\`
- **Detalhes de vulnerabilidade:** \`GET .../securityProblems/{id}\`
- **Entidades:** \`GET .../entities?entitySelector=type("SERVICE")&pageSize=50\`
- **Detalhes de entidade:** \`GET .../entities/{entityId}\`
- **Métricas (lista):** \`GET .../metrics?pageSize=50\`
- **Métricas (query):** \`GET .../metrics/query?metricSelector={selector}&from=now-2h\`
- **Settings:** \`GET .../settings/objects?schemaIds={schemaId}&pageSize=50\`

## Documentos
- **Listar:** \`GET {APPS_URL}/platform/document/v1/documents?filter=type%20eq%20"notebook"\`
- **Ler:** \`GET {APPS_URL}/platform/document/v1/documents/{id}\`
- **Criar/Atualizar:** \`POST/PUT {APPS_URL}/platform/document/v1/documents\`

## AutomationEngine
- **Listar workflows:** \`GET {APPS_URL}/platform/automation/v1/workflows\`
- **Criar workflow:** \`POST {APPS_URL}/platform/automation/v1/workflows\`

# Tabelas DQL Disponíveis

| Tabela | Descrição |
|---|---|
| \`logs\` | Logs de aplicação e infraestrutura |
| \`spans\` | Distributed traces (spans individuais) |
| \`events\` | Eventos do sistema, deploys, problemas Davis |
| \`bizevents\` | Business events customizados |
| \`dt.entity.service\` | Entidades de serviço |
| \`dt.entity.host\` | Entidades de host |
| \`dt.entity.process_group_instance\` | Instâncias de process group |
| \`dt.host.cpu.usage\` | Métrica de uso de CPU |
| \`dt.service.request.count\` | Métrica de contagem de requests |
| \`security.events\` | Eventos de segurança |
| \`user.sessions\` | Sessões de usuário (RUM) |
| \`user.events\` | Eventos de usuário (RUM) |

# Exemplos de DQL

## Logs com filtro por conteúdo (padrão completo)
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "error", caseSensitive: false)
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

## Logs de um serviço específico
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "error", caseSensitive: false)
| filter contains(dt.entity.service.name, "ms-payments")
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

## Logs por nível de erro
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "exception", caseSensitive: false)
| filter loglevel == "ERROR"
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

## Logs por entity ID
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "timeout", caseSensitive: false)
| filter dt.entity.service == "SERVICE-XXXXXXXX"
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

## Spans/traces com erro
\`\`\`
fetch spans, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false)
| filter status_code == "ERROR"
| sort timestamp desc
| limit 50
| fields timestamp, span.name, service.name, status_code, duration
\`\`\`

## Spans de um serviço específico
\`\`\`
fetch spans, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false)
| filter contains(service.name, "ms-payments")
| sort timestamp desc
| limit 50
| fields timestamp, span.name, status_code, duration, http.status_code
\`\`\`

## Eventos de deploy
\`\`\`
fetch events, scanLimitGBytes: 1
| filter event.type == "CUSTOM_DEPLOYMENT"
| sort timestamp desc
| limit 20
\`\`\`

## Métricas de CPU de um host
\`\`\`
fetch dt.host.cpu.usage, scanLimitGBytes: 1
| filter dt.entity.host == "HOST-XXXXXXXX"
\`\`\`

## Métricas de request count por serviço
\`\`\`
fetch dt.service.request.count, scanLimitGBytes: 1
| filter dt.entity.service == "SERVICE-XXXXXXXX"
\`\`\`

## Entidades via DQL
\`\`\`
fetch dt.entity.service
| filter contains(entity.name, "payments")
| fields entity.name, id, lifetime, tags
| limit 50
\`\`\`

## Problemas via DQL
\`\`\`
fetch events, scanLimitGBytes: 1
| filter event.kind == "DAVIS_PROBLEM"
| filter event.status == "ACTIVE"
| sort timestamp desc
| limit 20
\`\`\`

## Business events
\`\`\`
fetch bizevents, scanLimitGBytes: 1
| filter event.type == "com.myapp.checkout"
| sort timestamp desc
| limit 50
\`\`\`

## Smartscape topology
\`\`\`
fetch dt.entity.service
| expand runs_on = runs_on[dt.entity.process_group]
| fields entity.name, runs_on
| limit 50
\`\`\`

## Timeseries — Métricas agregadas
\`\`\`
timeseries avg_cpu = avg(dt.host.cpu.usage), by:{dt.entity.host}
| filter avg_cpu > 80
\`\`\`

\`\`\`
timeseries req_count = sum(dt.service.request.count), by:{dt.entity.service}
\`\`\`

## Eventos de segurança
\`\`\`
fetch security.events, scanLimitGBytes: 1
| sort timestamp desc
| limit 50
| fields timestamp, event.type, event.name, affected_entity
\`\`\`

# Estratégia de Investigação

Para investigar um incidente:
1. Liste problemas ativos via DQL ou API clássica
2. Identifique entidades afetadas
3. Consulte logs via DQL com o padrão completo (filtro + Smart Log Message + sort)
4. Correlacione com spans/traces via DQL
5. Verifique métricas relevantes

Para consultas de métricas e logs:
1. Execute DQL com filtros restritivos e \`scanLimitGBytes\`
2. SEMPRE inclua timeframes curtos (2h-12h)
3. Use \`| limit\` para restringir resultados`,

  instructionsPrompt: `Execute a requisição do usuário usando curl para a API do Dynatrace.

Passos:
1. **Use os dados do contexto**: O ambiente, Apps URL e header de autenticação (com o token já embutido) foram configurados automaticamente. Copie os templates de curl do contexto diretamente — o token Bearer já está incluso.
2. **Prefira DQL** para consultas de logs, spans, events, metrics e entidades.
3. **Use API clássica v2** apenas para detalhes de problemas por ID, vulnerabilidades ou endpoints que DQL não cobre.
4. **Execute a consulta** com curl, incluindo o header de autenticação e \`< /dev/null\`
5. **Apresente os resultados** de forma organizada e objetiva

## Template de curl para DQL (MÉTODO PRINCIPAL)

\`\`\`bash
curl -s -X POST "{APPS_URL}/platform/storage/query/v1/query:execute" \\
  -H "Authorization: Bearer {TOKEN}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"query": "<DQL>", "maxResultRecords": 1000, "fetchTimeoutSeconds": 60}' < /dev/null 2>&1
\`\`\`

## ⚠️ Padrão obrigatório para queries de logs

Toda query DQL de logs DEVE seguir este padrão completo:

\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "<TERMO>", caseSensitive: false)
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

- O trecho \`contains(content, "...", caseSensitive: false)\` é a parte variável — ajuste conforme a busca do usuário.
- Filtros adicionais (serviço, log level) são adicionados como linhas \`| filter\` separadas, logo após o filtro principal.
- O bloco Smart Log Message (fieldsAdd/parse/fieldsRemove) é OBRIGATÓRIO e deve ser incluído entre os filtros e o \`| sort\`.

## Template de curl para API Clássica v2

\`\`\`bash
curl -s -X GET "{APPS_URL}/platform/classic/environment-api/v2/problems?problemSelector=status(%22OPEN%22)&pageSize=50" \\
  -H "Authorization: Bearer {TOKEN}" \\
  -H "Accept: application/json" < /dev/null 2>&1
\`\`\`

## Regras importantes
- Para DQL de logs: SEMPRE inclua o bloco Smart Log Message e \`scanLimitGBytes\`
- Use timeframes curtos (2h-12h) para reduzir custos
- Se o usuário pedir logs ou métricas sem especificar timeframe, use as últimas 2h como padrão
- Se uma consulta falhar, tente uma abordagem alternativa ou reporte o erro claramente
- Inclua IDs de entidades (SERVICE-XXX, HOST-XXX) nos resultados quando disponíveis
- Se o usuário pedir logs de um serviço específico, ajuste o namespace no filtro \`kubernetes.namespace_labels.name\` (ex: ms-consortium-integration → \`"consortium-integration"\`). O padrão é \`"consortium"\`
- Use \`timeout_seconds: 30\` para API clássica, \`timeout_seconds: 60\` para DQL

## Exemplos por cenário

**"Quais problemas estão abertos?"**
→ DQL: \`fetch events, scanLimitGBytes: 1 | filter event.kind == "DAVIS_PROBLEM" | filter event.status == "ACTIVE"\`
→ Ou API clássica: GET .../problems?problemSelector=status(%22OPEN%22)

**"Mostra os logs de erro do ms-payments"**
→ DQL com padrão completo:
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "error", caseSensitive: false)
| filter contains(dt.entity.service.name, "ms-payments")
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

**"Buscar logs com CLIENT ERROR"**
→ DQL com padrão completo:
\`\`\`
fetch logs, scanLimitGBytes: 1
| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "[CLIENT ERROR]", caseSensitive: false)
${SMART_LOG_MESSAGE_BLOCK}
| sort timestamp desc
\`\`\`

**"Quais vulnerabilidades existem?"**
→ API clássica: GET .../securityProblems

**"Liste os serviços"**
→ DQL: \`fetch dt.entity.service | fields entity.name, id | limit 100\`

**"Mostra os spans com erro do ms-checkout"**
→ DQL: \`fetch spans, scanLimitGBytes: 1 | filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) | filter contains(service.name, "ms-checkout") | filter status_code == "ERROR"\`

**"Mostra os deploys recentes"**
→ DQL: \`fetch events, scanLimitGBytes: 1 | filter event.type == "CUSTOM_DEPLOYMENT" | sort timestamp desc\`
`,

  handleSteps: function* ({ prompt, logger }: AgentStepContext) {
    function extractStdout(toolResult: unknown): string {
      const arr = toolResult as
        | Array<{ type: string; value: unknown }>
        | undefined
      const result = arr?.[0]
      if (result && result.type === 'json') {
        const value = result.value as Record<string, unknown>
        return typeof value?.stdout === 'string' ? value.stdout : ''
      }
      return ''
    }

    // --- Duplicated from module-level for sandbox compatibility ---
    const ENVS = {
      PRD: {
        label: 'Produção',
        id: 'oxq68941',
        appsUrl: 'https://oxq68941.apps.dynatrace.com',
      },
      QA: {
        label: 'QA',
        id: 'dvh67605',
        appsUrl: 'https://dvh67605.apps.dynatrace.com',
      },
    } as const

    function detectEnvironment(text: string): 'PRD' | 'QA' {
      const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (/\b(qa|quality\s*assurance|homolog)\b/.test(normalized)) return 'QA'
      return 'PRD'
    }
    const DEFAULT_PLATFORM_TOKEN = ''
    // --- End of duplicated declarations ---

    const env = detectEnvironment(prompt || '')
    const envConfig = ENVS[env]
    logger.info('Target environment: ' + env + ' (' + envConfig.label + ')')

    // Step 1: Read DT_PLATFORM_TOKEN from environment
    // Try process.env first (available when Bun loads .env.local)
    let token = ''
    try {
      token = (typeof process !== 'undefined' && process.env?.DT_PLATFORM_TOKEN) || ''
    } catch {
      // process.env may not be available in sandbox context
    }

    // Fall back to run_terminal_command with robust multi-source detection
    // Tries: 1) direct env var, 2) .env.local file, 3) .env file, 4) shell profiles
    if (!token) {
      const tokenScript = [
        'TOKEN="$DT_PLATFORM_TOKEN"',
        'if [ -z "$TOKEN" ] && [ -f ".env.local" ]; then',
        '  TOKEN=$(grep "^DT_PLATFORM_TOKEN=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"\\x27]//;s/[\"\\x27]$//")',
        'fi',
        'if [ -z "$TOKEN" ] && [ -f ".env" ]; then',
        '  TOKEN=$(grep "^DT_PLATFORM_TOKEN=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\"\\x27]//;s/[\"\\x27]$//")',
        'fi',
        'if [ -z "$TOKEN" ]; then',
        '  for f in ~/.zshrc ~/.bashrc ~/.bash_profile ~/.zprofile ~/.profile; do',
        '    if [ -f "$f" ]; then',
        '      set +e; . "$f" >/dev/null 2>&1; set -e',
        '      TOKEN="$DT_PLATFORM_TOKEN"',
        '      [ -n "$TOKEN" ] && break',
        '    fi',
        '  done',
        'fi',
        'printf "%s" "$TOKEN"',
      ].join('\n')
      const { toolResult: tokenResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: tokenScript, timeout_seconds: 10 },
      }
      token = extractStdout(tokenResult).trim()
    }

    token = token || DEFAULT_PLATFORM_TOKEN

    if (!token) {
      logger.info('DT_PLATFORM_TOKEN not set')
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '❌ A variável de ambiente `DT_PLATFORM_TOKEN` não está configurada.\n\n' +
            'Para usar o Dynatrace Agent, configure um Platform Token (dt0s16):\n' +
            '```bash\nexport DT_PLATFORM_TOKEN="dt0s16.XXXXXXXX.YYYYYYYY..."\n```\n\n' +
            'O token pode ser gerado em:\n' +
            '- **Produção:** https://oxq68941.apps.dynatrace.com → Access Tokens\n' +
            '- **QA:** https://dvh67605.apps.dynatrace.com → Access Tokens\n\n' +
            'Scopes necessários: `storage:logs:read`, `storage:spans:read`, `storage:events:read`, `storage:metrics:read`, `storage:entities:read`, `storage:buckets:read`',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    if (!token.startsWith('dt0s16.')) {
      logger.info('Token does not have dt0s16 prefix: ' + token.slice(0, 12) + '...')
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '⚠️ O token configurado em `DT_PLATFORM_TOKEN` não parece ser um Platform Token (dt0s16).\n\n' +
            'Token encontrado: `' + token.slice(0, 12) + '...`\n\n' +
            'Este agente requer um **Platform Token** (prefixo `dt0s16.`). ' +
            'Tokens de API clássicos (dt0c01) ou tokens de agente (dt0g01) não são suportados.\n\n' +
            'Gere um Platform Token em: Access Tokens → Generate new token → Token type: Platform',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    logger.info('Platform token found (dt0s16)')

    // Step 2: Validate token with a lightweight DQL query
    const appsUrl = envConfig.appsUrl
    const authHeader = 'Authorization: Bearer ' + token

    logger.info('Validating token against ' + appsUrl + '...')

    const validateCmd =
      'curl -s -w "\\n%{http_code}" -X POST ' +
      '"' + appsUrl + '/platform/storage/query/v1/query:execute" ' +
      '-H "' + authHeader + '" ' +
      '-H "Content-Type: application/json" ' +
      '-H "Accept: application/json" ' +
      '-d \'{"query": "fetch logs, scanLimitGBytes: 1 | limit 1", "maxResultRecords": 1, "fetchTimeoutSeconds": 30}\' ' +
      '< /dev/null 2>/dev/null'

    const { toolResult: validateResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: validateCmd, timeout_seconds: 15 },
    }

    const validateOutput = extractStdout(validateResult).trim()
    const lastNewline = validateOutput.lastIndexOf('\n')
    const httpStatus = lastNewline >= 0
      ? validateOutput.slice(lastNewline + 1).trim()
      : validateOutput.trim()

    const isValid = httpStatus.startsWith('2')

    if (!isValid) {
      logger.info('Validation failed: HTTP ' + httpStatus)

      const responseBody = lastNewline >= 0 ? validateOutput.slice(0, lastNewline).trim() : ''
      let errorDetail = ''
      try {
        const parsed = JSON.parse(responseBody) as Record<string, unknown>
        errorDetail = String(parsed.error || parsed.message || '')
      } catch {
        errorDetail = responseBody.slice(0, 200)
      }

      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '❌ Falha na validação do token no ambiente ' + envConfig.label + ' (HTTP ' + httpStatus + ').\n\n' +
            (errorDetail ? '**Detalhe:** ' + errorDetail + '\n\n' : '') +
            'Possíveis causas:\n' +
            '1. Token expirado ou revogado\n' +
            '2. Token sem os scopes necessários (storage:logs:read, etc.)\n' +
            '3. Token pertence a outro ambiente (PRD vs QA)\n\n' +
            'Verifique o token e tente novamente.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    logger.info('Token validated ✅ (HTTP ' + httpStatus + ')')

    // Step 3: Inject context message with all templates
    const apiPrefix = 'platform/classic/environment-api/v2'
    const bearerRef = 'Authorization: Bearer ' + token

    let contextMessage =
      '=== DYNATRACE API CONTEXT ===\n\n' +
      '**Ambiente:** ' + envConfig.label + ' (' + envConfig.id + ')\n' +
      '**Autenticação:** Platform Token (dt0s16) ✅\n' +
      '**Apps URL:** `' + appsUrl + '`\n' +
      '**DQL Endpoint:** `' + appsUrl + '/platform/storage/query/v1/query:execute`\n' +
      '**API Clássica v2:** `' + appsUrl + '/' + apiPrefix + '`\n\n'

    contextMessage +=
      '### DQL — Método Principal (POST)\n\n' +
      '```bash\n' +
      'curl -s -X POST "' + appsUrl + '/platform/storage/query/v1/query:execute" ' +
      '-H "' + bearerRef + '" ' +
      '-H "Content-Type: application/json" ' +
      '-H "Accept: application/json" ' +
      '-d \'{"query": "<DQL>", "maxResultRecords": 1000, "fetchTimeoutSeconds": 60}\' ' +
      '< /dev/null 2>&1\n' +
      '```\n\n'

    contextMessage +=
      '### API Clássica v2 — Endpoints específicos\n\n' +
      '**Listar problemas abertos:**\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/' + apiPrefix + '/problems?problemSelector=status(%22OPEN%22)&pageSize=50" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n' +
      '**Detalhes de um problema:**\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/' + apiPrefix + '/problems/{problemId}" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n' +
      '**Listar entidades (serviços):**\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/' + apiPrefix + '/entities?entitySelector=type(%22SERVICE%22)&pageSize=50" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n' +
      '**Listar vulnerabilidades:**\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/' + apiPrefix + '/securityProblems?pageSize=50" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n' +
      '**Consultar métricas:**\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/' + apiPrefix + '/metrics/query?metricSelector={selector}&from=now-2h" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n'

    contextMessage +=
      '### Documentos\n\n' +
      '```bash\n' +
      'curl -s "' + appsUrl + '/platform/document/v1/documents?filter=type%20eq%20%22notebook%22" ' +
      '-H "' + bearerRef + '" -H "Accept: application/json" < /dev/null 2>&1\n' +
      '```\n\n'

    contextMessage +=
      '### Dicas\n' +
      '- **SEMPRE** filtre logs com: `| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false) AND contains(content, "<TERMO>", caseSensitive: false)`\n' +
      '- **SEMPRE** inclua o bloco Smart Log Message (fieldsAdd/parse/fieldsRemove) em queries de logs\n' +
      '- Para spans use: `| filter matchesValue(dt.system.bucket, "secmkp") AND contains(kubernetes.namespace_labels.name, "consortium", caseSensitive: false)`\n' +
      '- Use `timeout_seconds: 30` para API clássica, `timeout_seconds: 60` para DQL\n' +
      '- SEMPRE inclua `< /dev/null 2>&1` no final dos comandos curl\n' +
      '- Para DQL: SEMPRE inclua `scanLimitGBytes: 1` e timeframes curtos (2h-12h)\n' +
      '- URL-encode os parâmetros: `status("OPEN")` → `status(%22OPEN%22)`\n' +
      '- Prefira DQL para consultas de logs, spans, events, metrics e entidades\n' +
      '- Use API clássica v2 para detalhes de problemas por ID ou vulnerabilidades\n' +
      '- Se o usuário pedir logs de um serviço específico, ajuste o namespace no filtro (ex: ms-consortium-integration → "consortium-integration")'

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: contextMessage,
      },
      includeToolCall: false,
    }

    yield 'STEP_ALL'
  },
}

export default definition
