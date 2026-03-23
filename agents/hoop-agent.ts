import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

// Exported for unit testing. The same logic is duplicated inside handleSteps
// for sandbox compatibility (generators are serialized and must be self-contained).
export function detectPrdExecViolation(
  messageHistory: unknown[],
  prdNames: string[],
): { detected: boolean; connectionName: string } {
  const recentMessages = messageHistory.slice(-4)

  for (const msg of recentMessages) {
    const message = msg as { role?: string; content?: unknown[] }
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue

    for (const part of message.content) {
      const toolCall = part as {
        type?: string
        toolName?: string
        input?: Record<string, unknown>
      }
      if (
        toolCall.type !== 'tool-call' ||
        toolCall.toolName !== 'run_terminal_command'
      ) continue

      const command = String(toolCall.input?.command ?? '').toLowerCase()
      if (!/hoop\s+exec\b/.test(command)) continue

      const connMatch = command.match(/hoop\s+exec\s+([\w-]+)/)
      if (!connMatch) continue
      const execTarget = connMatch[1].toLowerCase()

      for (const prdName of prdNames) {
        if (execTarget === prdName.toLowerCase()) {
          return { detected: true, connectionName: prdName }
        }
      }

      if (/-prd-/i.test(connMatch[1])) {
        return { detected: true, connectionName: connMatch[1].toUpperCase() }
      }
    }
  }

  return { detected: false, connectionName: '' }
}

export const PRD_RUNBOOK_PATHS: Record<string, string> = {
  consortium: 'insurance/atlas-mgo-consortium-prd',
  consorcio: 'insurance/atlas-mgo-consortium-prd',
  consorcios: 'insurance/atlas-mgo-consortium-prd',
  consortia: 'insurance/atlas-mgo-consortium-prd',
}

export function getResolvedPrdRunbookPaths(
  keywords: string[],
  targetEnv: string | null,
  pathMapping: Record<string, string> = PRD_RUNBOOK_PATHS,
): string[] {
  if (targetEnv !== 'PRD') return []
  const paths: string[] = []
  for (const kw of keywords) {
    const path = pathMapping[kw.toLowerCase()]
    if (path && !paths.includes(path)) {
      paths.push(path)
    }
  }
  return paths
}

export function prioritizeRunbooksByPrdPaths(
  runbooks: Array<{ name: string }>,
  resolvedPaths: string[],
): Array<{ name: string }> {
  if (resolvedPaths.length === 0) return runbooks
  const lowerPaths = resolvedPaths.map((p) => p.toLowerCase())
  return [...runbooks].sort((a, b) => {
    const aMatch = lowerPaths.some((p) => a.name.toLowerCase().startsWith(p))
    const bMatch = lowerPaths.some((p) => b.name.toLowerCase().startsWith(p))
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return 0
  })
}

const definition: AgentDefinition = {
  id: 'hoop-agent',
  publisher,
  displayName: 'Hoop Agent',
  model: 'anthropic/claude-sonnet-4.6',

  spawnerPrompt:
    'Expert at secure infrastructure access, command execution, and session monitoring via the Hoop CLI (`hoop`). Hoop is an access gateway for databases, servers, and applications.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about infrastructure access, command execution, or session monitoring via Hoop',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  toolNames: ['run_terminal_command', 'add_message'],

  systemPrompt: `Você é um especialista em acesso seguro a infraestrutura que ajuda desenvolvedores a interagir com databases, servidores e aplicações através do Hoop.dev.

Você tem acesso à ferramenta run_terminal_command para executar comandos no terminal.

## ⛔ REGRA NÚMERO 1 — PRODUÇÃO (PRD): SOMENTE RUNBOOKS VIA API REST

**Esta é a regra mais importante de todas. Leia com atenção.**

Se a connection contém \`-PRD-\` no nome, você **DEVE** usar **EXCLUSIVAMENTE** a API REST de runbooks (\`POST /api/runbooks/exec\`). **NUNCA, sob NENHUMA circunstância, tente usar \`hoop exec\` em connections PRD.**

- \`hoop exec\` está **PERMANENTEMENTE DESABILITADO** em PRD — é uma política de segurança, não um bug
- \`hoop exec\` em PRD **SEMPRE** retornará erro \"exec is disabled for this connection\"
- **NÃO** use \`hoop exec\` como fallback se um runbook não existir
- Se não existir runbook adequado para PRD:
  1. Sugira usar a connection equivalente de **HOM** (troque \`-PRD-\` por \`-HOM-\` no nome)
  2. Sugira solicitar a criação de um novo runbook ao time responsável
  3. **NUNCA** tente \`hoop exec\` como alternativa — é proibido em PRD

## Sobre o Hoop.dev

O Hoop.dev é um access gateway que atua como proxy entre usuários e infraestrutura interna, oferecendo:
- Controle de acesso granular
- Gravação de sessões (session recording)
- Mascaramento de dados sensíveis (live data masking)
- Guardrails para bloquear queries perigosas
- Runbooks parametrizados (queries pré-aprovadas para produção)

## Modos de acesso

Cada connection tem dois modos de acesso independentes:
- **access_mode_runbooks:** Se "enabled", permite executar runbooks pré-aprovados via API REST (sem aprovação manual!)
- **access_mode_exec:** Se "enabled", permite executar comandos diretos via \`hoop exec\` CLI (**SOMENTE em ambientes NÃO-PRD**)

## API REST do Hoop — Execução de Runbooks (MÉTODO PRINCIPAL PARA PRD)

### Autenticação
O token e a URL da API ficam em \`~/.hoop/config.toml\` (preenchidos após \`hoop login\`):
\`\`\`bash
HOOP_CONFIG=~/.hoop/config.toml
TOKEN=$(grep '^token' "$HOOP_CONFIG" | head -1 | cut -d'=' -f2 | tr -d ' "')
API_URL=$(grep '^api_url' "$HOOP_CONFIG" | head -1 | cut -d'=' -f2 | tr -d ' "')
\`\`\`

### POST /api/runbooks/exec — Executar um runbook
\`\`\`bash
curl -sk -X POST "\${API_URL}/api/runbooks/exec" \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "connection_name": "<NOME_DA_CONNECTION>",
    "repository": "github.com/PicPay/database-automation-runbooks",
    "file_name": "<caminho/do/runbook.runbook.js>",
    "parameters": {"param1": "valor1", "param2": "valor2"}
  }' < /dev/null 2>&1
\`\`\`

**Resposta (sucesso):**
\`\`\`json
{
  "has_review": false,
  "session_id": "uuid-da-sessao",
  "output": "resultado da query...",
  "output_status": "success",
  "truncated": false,
  "execution_time": 993,
  "exit_code": 0
}
\`\`\`

**Repositório padrão PicPay:** \`github.com/PicPay/database-automation-runbooks\`

### GET /api/sessions/{session_id} — Obter resultado assíncrono
Se precisar verificar o resultado de uma execução posterior:
\`\`\`bash
curl -sk "\${API_URL}/api/sessions/{session_id}?expand=event_stream&event_stream=utf8" \\
  -H "Authorization: Bearer \${TOKEN}" < /dev/null 2>&1
\`\`\`

## Hoop CLI — \`hoop exec\` (⛔ SOMENTE para HOM/QA/DEV — PROIBIDO em PRD)

**⛔ NUNCA use \`hoop exec\` em connections que contêm \`-PRD-\` no nome.**

O \`hoop exec\` só funciona em connections NÃO-PRD onde \`access_mode_exec\` está "enabled" — tipicamente HOM, QA e DEV.

### Sintaxe
\`\`\`bash
echo '<query>' > /tmp/hoop_query.tmp && hoop exec <connection> -f /tmp/hoop_query.tmp < /dev/null 2>&1

# Com --auto-approve (para connections com plugin review)
echo '<query>' > /tmp/hoop_query.tmp && hoop exec <connection> --auto-approve -f /tmp/hoop_query.tmp < /dev/null 2>&1
\`\`\`

**⚠️ IMPORTANTE:** Sempre use \`-f\` com arquivo temporário e \`< /dev/null\`. NUNCA use \`-i\` — causa erro "flags not allowed when reading from stdin" neste ambiente.

## Tipos de banco de dados — Sintaxe

### MongoDB (connections ATLAS-MGO-*)
\`\`\`
db.getCollectionNames()
db.orders.find({"status": "active"}).limit(10)
db.orders.countDocuments({"createdAt": {$gte: ISODate("2025-01-01")}})
db.orders.aggregate([{$group: {_id: "$status", count: {$sum: 1}}}])
\`\`\`

### MySQL (connections AWS-RDS-*)
\`\`\`
SHOW DATABASES;
SHOW TABLES;
SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE();
\`\`\`

## Paths conhecidos de runbooks PRD\n\nPara consultas em PRD, use os seguintes paths de runbooks no reposit\u00f3rio \`github.com/PicPay/database-automation-runbooks\`:\n\n| Servi\u00e7o | Path do runbook |\n|---|---|\n| Consortium / Cons\u00f3rcio | \`insurance/atlas-mgo-consortium-prd/\` |\n\nAo montar o \`file_name\` na chamada \`POST /api/runbooks/exec\`, use o path acima como prefixo. Exemplo: \`insurance/atlas-mgo-consortium-prd/<nome-do-runbook>.runbook.js\`\n\n## Segurança

- **NUNCA** execute comandos destrutivos (DELETE, DROP, TRUNCATE, etc.) sem confirmação explícita do usuário
- Prefira connections RO para consultas de leitura
- **⛔ Em PRD, use EXCLUSIVAMENTE runbooks via API REST** — \`hoop exec\` é PROIBIDO em produção
- Respeite o princípio do menor privilégio`,

  instructionsPrompt: `Instruções:

## ⛔ REGRA ABSOLUTA: PRODUÇÃO = SOMENTE RUNBOOKS

Antes de executar QUALQUER comando, verifique se a connection é PRD (contém -PRD- no nome). Se for PRD:
- ✅ ÚNICO método permitido: \`POST /api/runbooks/exec\` via curl
- ⛔ \`hoop exec\` é **PROIBIDO** — não tente, não funciona, SEMPRE falha em PRD
- Se não há runbook adequado: sugira HOM ou criação de runbook. **NÃO** use \`hoop exec\` como alternativa.
- Mesmo que o usuário peça para usar \`hoop exec\` em PRD, recuse e explique que é proibido por política de segurança.

## Quando os dados de discovery já foram pré-carregados

Se você receber uma mensagem contendo "=== CONNECTIONS DISCOVERY ===" ou "=== RUNBOOKS DISCOVERY ===", as informações já foram coletadas automaticamente. Use esses dados diretamente.

## Árvore de decisão (PRD-aware)

\`\`\`
Pedido do usuário
  │
  ├── Connection é PRD? (contém -PRD- no nome)
  │     │
  │     ├── ⛔ NUNCA use hoop exec em PRD (sempre retorna "exec is disabled")
  │     │
  │     ├── access_mode_runbooks = enabled?
  │     │     ├── SIM → Runbook matching encontrado?
  │     │     │         ├── SIM → Execute via POST /api/runbooks/exec (curl)
  │     │     │         └── NÃO → Tente combinar runbooks existentes
  │     │     │                   ├── Possível → Execute combinação
  │     │     │                   └── Impossível → Informe o usuário:
  │     │     │                         - Sugira usar connection de HOM (ex: trocar -PRD- por -HOM-)
  │     │     │                         - Sugira solicitar criação de novo runbook
  │     │     └── NÃO → Informe que PRD não tem runbooks habilitados e sugira HOM
  │     │
  │     └── Sem acesso possível em PRD → Sugira HOM ou solicitar acesso
  │
  ├── Connection NÃO é PRD? (HOM/QA/DEV)
  │     ├── access_mode_runbooks = enabled + runbook encontrado?
  │     │     └── SIM → Execute via POST /api/runbooks/exec (preferencial)
  │     ├── access_mode_exec = enabled?
  │     │     ├── SIM → Use hoop exec com -f (arquivo temporário) + < /dev/null
  │     │     │         ├── Tem plugin review? → adicione --auto-approve
  │     │     │         └── Sem review → execute direto
  │     │     └── NÃO → Informe o usuário que não é possível acessar esta connection
  │     └── Nenhum acesso → Sugira alternativas
  │
  └── Nenhuma connection adequada → Sugira alternativas (HOM, outra BU, etc.)
\`\`\`

## Como executar um runbook via API REST (método principal para PRD)

Use run_terminal_command para executar via curl:

\`\`\`bash
HOOP_CONFIG=~/.hoop/config.toml; TOKEN=$(grep '^token' "$HOOP_CONFIG" | head -1 | cut -d'=' -f2 | tr -d ' "'); API_URL=$(grep '^api_url' "$HOOP_CONFIG" | head -1 | cut -d'=' -f2 | tr -d ' "'); curl -sk -X POST "\${API_URL}/api/runbooks/exec" -H "Authorization: Bearer \${TOKEN}" -H "Content-Type: application/json" -d '{"connection_name": "<CONNECTION>", "repository": "github.com/PicPay/database-automation-runbooks", "file_name": "<RUNBOOK_PATH>", "parameters": {<PARAMS>}}' < /dev/null 2>&1
\`\`\`

**Timeout:** Use \`timeout_seconds: 120\` para execução de runbooks.

A resposta inclui \`output\` com o resultado direto e \`output_status\` indicando sucesso/falha.

## Como usar hoop exec (SOMENTE para HOM/QA/DEV — NUNCA em PRD)

⛔ **PROIBIDO EM PRD.** Esta seção aplica-se EXCLUSIVAMENTE a connections de HOM/QA/DEV. Se a connection contém -PRD- no nome, IGNORE esta seção e use SOMENTE runbooks via API REST.

Quando access_mode_exec=enabled em connections NÃO-PRD:

\`\`\`bash
echo '<query>' > /tmp/hoop_query.tmp && hoop exec <connection> -f /tmp/hoop_query.tmp < /dev/null 2>&1
\`\`\`

**⚠️ NUNCA use a flag -i** — causa conflito de stdin neste ambiente. Sempre use arquivo temporário com -f.
**⚠️ NUNCA use hoop exec em connections PRD** — sempre falhará com "exec is disabled".

**Timeout:** Use \`timeout_seconds: 60\` para queries simples, \`timeout_seconds: 90\` para complexas.

## Paths de runbooks PRD conhecidos\n\nPara consultas de **consortium/cons\u00f3rcio em PRD**, os runbooks ficam no path:\n- \`insurance/atlas-mgo-consortium-prd/<nome>.runbook.js\`\n\nUse este path como \`file_name\` na chamada \`POST /api/runbooks/exec\`.\n\n## Convenção de nomes de connections

- **MongoDB Atlas:** \`ATLAS-MGO-<SERVICE>-<ENV>-<MODE>\` (ex: ATLAS-MGO-CONSORTIUM-PRD-RO)
- **MySQL RDS:** \`AWS-RDS-<SERVICE>-<REGION>-<ENV>-<MODE>\` (ex: AWS-RDS-CONSORTIUM-USE1-PRD-RO)

Onde: \`<ENV>\` = PRD/HOM/QA/DEV, \`<MODE>\` = RO/RW

**Identificação de ambiente:** O segmento \`-PRD-\`, \`-HOM-\`, \`-QA-\`, \`-DEV-\` no nome da connection indica o ambiente.

## Mapeamento de serviços entre ambientes (CRÍTICO)

Na PicPay, a estrutura de connections varia entre ambientes:

### PRD e HOM — Connections dedicadas por serviço
Cada serviço tem suas próprias connections dedicadas:
- \`ATLAS-MGO-CONSORTIUM-PRD-RO\` (MongoDB do consórcio)
- \`AWS-RDS-CONSORTIUM-PAYMENT-ENGINE-USE1-PRD-RO\` (MySQL do payment engine de consórcio)
- \`ATLAS-MGO-CONSORTIUM-HOM-RO\` (MongoDB do consórcio em HOM)

### QA e DEV — Clusters unificados (umbrella)
Em QA/DEV, múltiplos serviços são **consolidados** em clusters únicos:
- O cluster **INSURANCE** contém: consortium, payment-engine, e outros serviços de seguros
- Connection: \`ATLAS-MGO-INSURANCE-QA-RO\` (contém dados de consórcio, seguros, etc.)

### Tabela de mapeamento serviço → connection

| Serviço | PRD/HOM | QA/DEV |
|---|---|---|
| consortium (consórcio) | CONSORTIUM | INSURANCE (cluster unificado) |
| consortium-payment-engine | CONSORTIUM-PAYMENT-ENGINE | INSURANCE (cluster unificado) |
| insurance (seguros) | INSURANCE | INSURANCE |

**⚠️ IMPORTANTE:** Quando o usuário pedir dados de "consórcio em QA", busque connections com INSURANCE no nome, NÃO com CONSORTIUM (que não existe em QA).

## Quando não há runbook disponível para PRD

Se o usuário precisa consultar dados em PRD mas não existe runbook adequado:

1. **Sugira a connection equivalente de HOM** — troque \`-PRD-\` por \`-HOM-\` no nome da connection
2. **Informe que em HOM o hoop exec pode estar disponível** para queries ad-hoc
3. **Sugira solicitar a criação de um novo runbook** ao time de database/infraestrutura para futuras consultas em PRD

## Descoberta cross-environment (mapeamento de serviços)

Quando o usuário mencionar um serviço + ambiente específico, use o mapeamento:

| Se o usuário pedir... | Em QA/DEV busque connections com... | Em PRD/HOM busque connections com... |
|---|---|---|
| consórcio, consortium | **INSURANCE** (cluster unificado) | **CONSORTIUM** (dedicado) |
| payment-engine consórcio | **INSURANCE** (cluster unificado) | **CONSORTIUM-PAYMENT-ENGINE** (dedicado) |
| seguros, insurance | **INSURANCE** | **INSURANCE** |

**Fluxo:**
1. Identifique o ambiente alvo no prompt (QA, DEV, HOM, PRD)
2. Se QA/DEV: expanda keywords para incluir o cluster umbrella (ex: consortium → também busque insurance)
3. Se PRD/HOM: use o nome dedicado do serviço (ex: consortium → busque consortium)
4. Se nenhum ambiente especificado: busque em todos

## Recuperação de erros

| Erro | Solução |
|---|---|
| "exec is disabled for this connection" | **⛔ PARE IMEDIATAMENTE. Connection é PRD → hoop exec é PROIBIDO. NÃO tente novamente com hoop exec. Use SOMENTE runbooks via API REST (\`POST /api/runbooks/exec\`). Se não há runbook, sugira HOM ou criação de runbook.** |
| "flags not allowed when reading from stdin" | Use arquivo temporário com -f + < /dev/null |
| "require use of --auto-approve option" | Adicione --auto-approve |
| Timeout na execução | Aumente timeout_seconds |
| 401 Unauthorized | Token expirado — oriente \`hoop login\` |`,

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

    function extractKeywords(text: string): string[] {
      const aliases: Record<string, string[]> = {
        consortia: ['consortium', 'insurance'],
        consorcio: ['consortium', 'insurance'],
        consorcios: ['consortium', 'insurance'],
        consortium: ['insurance'],
        seguro: ['insurance', 'consortium'],
        seguros: ['insurance', 'consortium'],
        insurance: ['consortium'],
        pagamento: ['payment'],
        pagamentos: ['payment'],
        contratacao: ['contratac', 'hiring', 'contract', 'consortium', 'insurance'],
        contratacoes: ['contratac', 'hiring', 'contract', 'consortium', 'insurance'],
        contrato: ['contract'],
        contratos: ['contract'],
      }

      const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')

      const words = normalized.split(/\s+/).filter((w) => w.length >= 3)
      const expanded: string[] = [...words]

      for (const word of words) {
        const mapped = aliases[word]
        if (mapped) {
          expanded.push(...mapped)
        }
      }

      return [...new Set(expanded)]
    }

    // Cross-environment service-to-cluster mapping
    // In QA/DEV, multiple services are consolidated under umbrella clusters
    // In PRD/HOM, each service has dedicated connections
    const serviceToClusterMapping: Record<string, { umbrella: string; dedicated: string[] }> = {
      consortium: { umbrella: 'insurance', dedicated: ['consortium'] },
      'payment-engine': { umbrella: 'insurance', dedicated: ['consortium-payment-engine'] },
      insurance: { umbrella: 'insurance', dedicated: ['insurance'] },
    }

    const prdRunbookPaths: Record<string, string> = {
      consortium: 'insurance/atlas-mgo-consortium-prd',
      consorcio: 'insurance/atlas-mgo-consortium-prd',
      consorcios: 'insurance/atlas-mgo-consortium-prd',
      consortia: 'insurance/atlas-mgo-consortium-prd',
    }

    function _getResolvedPrdRunbookPaths(kws: string[], env: string | null): string[] {
      if (env !== 'PRD') return []
      const paths: string[] = []
      for (const kw of kws) {
        const p = prdRunbookPaths[kw.toLowerCase()]
        if (p && !paths.includes(p)) paths.push(p)
      }
      return paths
    }

    function detectTargetEnvironment(text: string): string | null {
      const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (/\b(qa|quality\s*assurance)\b/.test(normalized)) return 'QA'
      if (/\bdev(elopment|elop)?\b/.test(normalized)) return 'DEV'
      if (/\b(hom|homolog(acao|ation)?)\b/.test(normalized)) return 'HOM'
      if (/\b(prd|prod(ucao|uction|ution)?)\b/.test(normalized)) return 'PRD'
      return null
    }

    function expandKeywordsForEnvironment(baseKeywords: string[], targetEnv: string | null): string[] {
      const expanded = [...baseKeywords]
      const isUmbrellaEnv = targetEnv === 'QA' || targetEnv === 'DEV'

      for (const kw of baseKeywords) {
        const mapping = serviceToClusterMapping[kw]
        if (mapping) {
          if (isUmbrellaEnv) {
            // In QA/DEV, add the umbrella cluster name
            if (!expanded.includes(mapping.umbrella)) {
              expanded.push(mapping.umbrella)
            }
          } else {
            // In PRD/HOM or unknown, add dedicated names
            for (const ded of mapping.dedicated) {
              if (!expanded.includes(ded)) {
                expanded.push(ded)
              }
            }
          }
        }
      }

      return [...new Set(expanded)]
    }

    function isPrdConnection(name: string): boolean {
      return /-PRD-/i.test(name)
    }

    function getEnvironment(name: string): string {
      if (/-PRD-/i.test(name)) return 'PRD'
      if (/-HOM-/i.test(name)) return 'HOM'
      if (/-QA-/i.test(name)) return 'QA'
      if (/-DEV-/i.test(name)) return 'DEV'
      return '—'
    }

    // Duplicated from module-level export for sandbox compatibility
    function _detectPrdExecViolation(
      messageHistory: unknown[],
      prdNames: string[],
    ): { detected: boolean; connectionName: string } {
      const recentMessages = messageHistory.slice(-4)
      for (const msg of recentMessages) {
        const message = msg as { role?: string; content?: unknown[] }
        if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
        for (const part of message.content) {
          const toolCall = part as { type?: string; toolName?: string; input?: Record<string, unknown> }
          if (toolCall.type !== 'tool-call' || toolCall.toolName !== 'run_terminal_command') continue
          const command = String(toolCall.input?.command ?? '').toLowerCase()
          if (!/hoop\s+exec\b/.test(command)) continue
          const connMatch = command.match(/hoop\s+exec\s+([\w-]+)/)
          if (!connMatch) continue
          const execTarget = connMatch[1].toLowerCase()
          for (const prdName of prdNames) {
            if (execTarget === prdName.toLowerCase()) {
              return { detected: true, connectionName: prdName }
            }
          }
          if (/-prd-/i.test(connMatch[1])) {
            return { detected: true, connectionName: connMatch[1].toUpperCase() }
          }
        }
      }
      return { detected: false, connectionName: '' }
    }

    interface ConnectionInfo {
      name: string
      type: string
      subtype: string
      status: string
      access_mode_exec: string
      access_mode_runbooks: string
    }

    interface RunbookInfo {
      name: string
      metadata: Record<
        string,
        {
          description?: string
          required?: boolean
          type?: string
          default?: string
        }
      >
    }

    // Shell prefix to read token and API URL from hoop config
    const configPrefix =
      "HOOP_CONFIG=~/.hoop/config.toml; " +
      "TOKEN=$(grep '^token ' \"$HOOP_CONFIG\" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d ' \"'); " +
      "API_URL=$(grep '^api_url ' \"$HOOP_CONFIG\" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d ' \"')"

    logger.info('Auto-discovering Hoop connections via REST API...')

    // Step 1: Read config and verify authentication
    const configCheckCmd =
      configPrefix + '; ' +
      'if [ -z "$TOKEN" ] || [ -z "$API_URL" ]; then ' +
      '  echo "HOOP_CONFIG_MISSING"; ' +
      'else ' +
      '  echo "API_URL=$API_URL"; ' +
      '  echo "TOKEN_LENGTH=${#TOKEN}"; ' +
      'fi'

    const { toolResult: configResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: configCheckCmd, timeout_seconds: 10 },
    }

    const configOutput = extractStdout(configResult)

    if (configOutput.includes('HOOP_CONFIG_MISSING')) {
      logger.info('Hoop config missing, checking CLI installation...')

      const { toolResult: cliCheckResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command: 'command -v hoop >/dev/null 2>&1 && echo "HOOP_CLI_INSTALLED" || echo "HOOP_CLI_NOT_INSTALLED"',
          timeout_seconds: 10,
        },
      }

      const cliOutput = extractStdout(cliCheckResult)

      if (cliOutput.includes('HOOP_CLI_NOT_INSTALLED')) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'O Hoop não está configurado. Instale e configure:\n' +
              '1. **Instalar CLI (macOS):** `brew tap hoophq/brew https://github.com/hoophq/brew.git && brew install hoop`\n' +
              '2. **Configurar:** `hoop config create --api-url https://hoop-prd.internal.ppay.me`\n' +
              '3. **Autenticar:** `hoop login`',
          },
          includeToolCall: false,
        }
      } else {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'O Hoop CLI está instalado mas não autenticado. Configure:\n' +
              '1. `hoop config create --api-url https://hoop-prd.internal.ppay.me`\n' +
              '2. `hoop login`',
          },
          includeToolCall: false,
        }
      }

      yield 'STEP_ALL'
      return
    }

    // Step 1.5: Validate token and re-authenticate if expired
    logger.info('Validating Hoop authentication token...')

    const validateCmd =
      configPrefix + '; ' +
      'curl -sk -o /dev/null -w "%{http_code}" "${API_URL}/api/connections?limit=1" ' +
      '-H "Authorization: Bearer ${TOKEN}" < /dev/null 2>/dev/null'

    const { toolResult: validateResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: validateCmd, timeout_seconds: 15 },
    }

    const httpStatus = extractStdout(validateResult).trim()
    const isTokenValid = httpStatus.startsWith('2')

    if (!isTokenValid) {
      logger.info('Token expired or invalid (HTTP ' + httpStatus + '), running hoop login...')

      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '🔐 Token do Hoop expirado ou inválido (HTTP ' + httpStatus + '). Executando `hoop login` para re-autenticar...\n⚠️ Isso pode abrir uma janela no navegador para autenticação OAuth.',
        },
        includeToolCall: false,
      }

      const { toolResult: loginResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command: 'hoop login < /dev/null 2>&1',
          timeout_seconds: 60,
        },
      }

      const loginOutput = extractStdout(loginResult)
      logger.info('Login output: ' + loginOutput.slice(0, 300))

      // Validate again after login
      const { toolResult: revalidateResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: validateCmd, timeout_seconds: 15 },
      }

      const newHttpStatus = extractStdout(revalidateResult).trim()

      if (!newHttpStatus.startsWith('2')) {
        logger.info('Re-authentication failed (HTTP ' + newHttpStatus + ')')
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              '❌ Falha na re-autenticação automática do Hoop (HTTP ' + newHttpStatus + ').\n\n' +
              'O `hoop login` pode ter aberto uma janela no navegador que precisa ser completada.\n\n' +
              'Tente manualmente no terminal:\n' +
              '1. `hoop login`\n' +
              '2. Complete a autenticação OAuth no navegador\n' +
              '3. Depois execute seu pedido novamente.',
          },
          includeToolCall: false,
        }
        yield 'STEP_ALL'
        return
      }

      logger.info('Re-authentication successful (HTTP ' + newHttpStatus + ')')
    } else {
      logger.info('Token valid (HTTP ' + httpStatus + ')')
    }

    // Step 2: Get all connections via REST API
    const connectionsCmd =
      configPrefix + '; ' +
      'curl -sk "${API_URL}/api/connections" ' +
      '-H "Authorization: Bearer ${TOKEN}" < /dev/null 2>&1 | ' +
      "python3 -c '" +
      'import sys, json\n' +
      'try:\n' +
      '    data = json.load(sys.stdin)\n' +
      '    if isinstance(data, dict) and "message" in data:\n' +
      '        print(json.dumps({"error": data["message"]}))\n' +
      '    else:\n' +
      '        result = []\n' +
      '        for c in data:\n' +
      '            result.append({"name": c.get("name", ""), "type": c.get("type", ""), "subtype": c.get("subtype", ""), "status": c.get("status", ""), "access_mode_exec": c.get("access_mode_exec", ""), "access_mode_runbooks": c.get("access_mode_runbooks", "")})\n' +
      '        print(json.dumps(result))\n' +
      'except Exception as e:\n' +
      '    print(json.dumps({"error": str(e)}))\n' +
      "'"

    const { toolResult: connectionsResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: connectionsCmd, timeout_seconds: 30 },
    }

    const connectionsOutput = extractStdout(connectionsResult)
    let allConnections: ConnectionInfo[] = []

    try {
      const parsed = JSON.parse(connectionsOutput)
      if (parsed.error) {
        logger.info('API error: ' + parsed.error)
        if (
          parsed.error.includes('unauthorized') ||
          parsed.error.includes('Unauthorized')
        ) {
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                'Token do Hoop expirado ou inválido. Re-autentique:\n' +
                '1. `hoop login`\n' +
                'Depois tente novamente.',
            },
            includeToolCall: false,
          }
          yield 'STEP_ALL'
          return
        }
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Erro ao consultar API do Hoop: ' + parsed.error + '\n' +
              'Tente re-autenticar com `hoop login`.',
          },
          includeToolCall: false,
        }
        yield 'STEP_ALL'
        return
      }
      allConnections = parsed as ConnectionInfo[]
    } catch {
      logger.info('Failed to parse connections JSON: ' + connectionsOutput.slice(0, 200))
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            'Falha ao obter connections da API do Hoop. Output:\n```\n' +
            connectionsOutput.slice(0, 500) +
            '\n```\nTente re-autenticar com `hoop login`.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    if (allConnections.length === 0) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content: 'Nenhuma connection disponível no Hoop para este usuário.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    // Step 3: Filter connections by keywords (environment-aware)
    const baseKeywords = extractKeywords(prompt || '')
    const targetEnv = detectTargetEnvironment(prompt || '')
    const keywords = expandKeywordsForEnvironment(baseKeywords, targetEnv)

    logger.info(
      'Target environment: ' + (targetEnv || 'all') +
      ', base keywords: [' + baseKeywords.join(', ') +
      '], expanded keywords: [' + keywords.join(', ') + ']',
    )

    let matchedConnections =
      keywords.length > 0
        ? allConnections.filter((conn) => {
            const connLower = conn.name.toLowerCase()
            return keywords.some((kw) => connLower.includes(kw))
          })
        : []

    // If a target environment was detected, prioritize connections from that environment
    if (targetEnv && matchedConnections.length > 0) {
      const envFiltered = matchedConnections.filter((c) =>
        c.name.toUpperCase().includes('-' + targetEnv + '-'),
      )
      if (envFiltered.length > 0) {
        matchedConnections = envFiltered
      }
    }

    const relevantConnections =
      matchedConnections.length > 0
        ? matchedConnections
        : allConnections.slice(0, 15)

    // Classify connections by environment
    const prdConnections = relevantConnections.filter((c) => isPrdConnection(c.name))
    const nonPrdConnections = relevantConnections.filter((c) => !isPrdConnection(c.name))
    const prdConnectionNames = prdConnections.map((c) => c.name.toUpperCase())

    const resolvedPrdPaths = _getResolvedPrdRunbookPaths(baseKeywords, targetEnv)
    if (resolvedPrdPaths.length > 0) {
      logger.info('Resolved PRD runbook paths: [' + resolvedPrdPaths.join(', ') + ']')
    }

    // Step 4: Discover runbooks via REST API for connections with runbooks enabled
    const runbookConnections = relevantConnections.filter(
      (c) => c.access_mode_runbooks === 'enabled',
    )

    let repository = ''
    let matchedRunbooks: RunbookInfo[] = []

    if (runbookConnections.length > 0) {
      logger.info(
        'Found ' +
          runbookConnections.length +
          ' connections with runbooks enabled — discovering runbooks...',
      )

      // Derive connection patterns for full-path matching
      const connectionPatterns = runbookConnections
        .map((c) => c.name.toLowerCase().replace(/-(ro|rw)$/, ''))
        .filter((v, i, a) => a.indexOf(v) === i)

      // Extract service keywords from connection names for name-based matching
      const noiseWords = new Set(['atlas', 'mgo', 'aws', 'rds', 'use1', 'use2', 'sae1', 'prd', 'hom', 'qa', 'dev', 'ro', 'rw'])
      const serviceKeywords = runbookConnections
        .flatMap((c) => c.name.toLowerCase().split('-'))
        .filter((w) => w.length >= 3 && !noiseWords.has(w))
      const runbookKeywords = [...new Set([...keywords, ...serviceKeywords])]

      const patternsJson = JSON.stringify(connectionPatterns)
      const keywordsJson = JSON.stringify(runbookKeywords)
      const resolvedPathsJson = JSON.stringify(resolvedPrdPaths.map((p) => p.toLowerCase()))

      const runbooksCmd =
        configPrefix + '; ' +
        'curl -sk "${API_URL}/api/runbooks" ' +
        '-H "Authorization: Bearer ${TOKEN}" < /dev/null 2>&1 | ' +
        "python3 -c '" +
        'import sys, json\n' +
        'patterns = ' + patternsJson + '\n' +
        'kws = ' + keywordsJson + '\n' +
        'resolved_paths = ' + resolvedPathsJson + '\n' +
        'try:\n' +
        '    data = json.load(sys.stdin)\n' +
        '    result = {"repository": "", "runbooks": []}\n' +
        '    for repo in data.get("repositories", []):\n' +
        '        if not result["repository"]:\n' +
        '            result["repository"] = repo.get("repository", "")\n' +
        '        for item in repo.get("items", []):\n' +
        '            name = item.get("name", "").lower()\n' +
        '            is_match = (resolved_paths and any(name.startswith(rp + "/") or name.startswith(rp + "\\\\") for rp in resolved_paths)) or any(p in name for p in patterns) or (not resolved_paths and any(kw in name for kw in kws))\n' +
        '            if is_match:\n' +
        '                result["runbooks"].append({"name": item.get("name", ""), "metadata": item.get("metadata", {})})\n' +
        '    if "items" in data:\n' +
        '        for item in data["items"]:\n' +
        '            name = item.get("name", "").lower()\n' +
        '            is_match = (resolved_paths and any(name.startswith(rp + "/") or name.startswith(rp + "\\\\") for rp in resolved_paths)) or any(p in name for p in patterns) or (not resolved_paths and any(kw in name for kw in kws))\n' +
        '            if is_match:\n' +
        '                result["runbooks"].append({"name": item.get("name", ""), "metadata": item.get("metadata", {})})\n' +
        '    print(json.dumps(result, ensure_ascii=False))\n' +
        'except Exception as e:\n' +
        '    print(json.dumps({"repository": "", "runbooks": [], "error": str(e)}))\n' +
        "'"

      const { toolResult: runbooksResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: runbooksCmd, timeout_seconds: 30 },
      }

      const runbooksOutput = extractStdout(runbooksResult)

      try {
        const parsed = JSON.parse(runbooksOutput) as {
          repository: string
          runbooks: RunbookInfo[]
          error?: string
        }
        repository = parsed.repository
        matchedRunbooks = parsed.runbooks
        if (parsed.error) {
          logger.info('Runbooks parsing error: ' + parsed.error)
        }
        logger.info(
          'Found ' +
            matchedRunbooks.length +
            ' runbooks matching connection patterns',
        )
      } catch {
        logger.info(
          'Failed to parse runbooks JSON: ' + runbooksOutput.slice(0, 200),
        )
      }
    }

    // Step 5: Build enriched context message
    let contextMessage = ''

    // PRD warning at the very top if PRD connections are present
    if (prdConnections.length > 0) {
      contextMessage +=
        '⛔ **ATENÇÃO: Connections PRD detectadas. Use EXCLUSIVAMENTE runbooks via API REST (`POST /api/runbooks/exec`). O comando `hoop exec` é PROIBIDO em produção.**\n\n'
    }

    contextMessage += '=== CONNECTIONS DISCOVERY ===\n\n'

    // Connection summary table
    if (matchedConnections.length > 0) {
      contextMessage +=
        'Encontradas **' +
        matchedConnections.length +
        ' connections** relacionadas ao seu pedido'
      if (prdConnections.length > 0) {
        contextMessage += ' (' + prdConnections.length + ' PRD, ' + nonPrdConnections.length + ' não-PRD)'
      }
      contextMessage += '.\n\n'
    } else {
      contextMessage +=
        'Nenhuma connection específica identificada no pedido. Mostrando as primeiras ' +
        relevantConnections.length +
        ' connections.\n\n'
    }

    contextMessage += '### Connections relevantes\n\n'
    contextMessage +=
      '| Connection | Ambiente | Tipo | Status | Exec | Runbooks | Método de acesso |\n' +
      '|---|---|---|---|---|---|---|\n'

    for (const conn of relevantConnections) {
      const env = getEnvironment(conn.name)
      const isPrd = env === 'PRD'
      const accessMethod = isPrd
        ? (conn.access_mode_runbooks === 'enabled' ? '✅ API REST (runbooks)' : '❌ Sem acesso')
        : (conn.access_mode_exec === 'enabled' ? '✅ hoop exec / API REST' : (conn.access_mode_runbooks === 'enabled' ? '✅ API REST (runbooks)' : '❌ Sem acesso'))

      contextMessage +=
        '| ' + conn.name +
        ' | ' + (isPrd ? '🔴 PRD' : env) +
        ' | ' + (conn.subtype || conn.type) +
        ' | ' + conn.status +
        ' | ' + (isPrd ? '⛔ disabled' : conn.access_mode_exec) +
        ' | ' + conn.access_mode_runbooks +
        ' | ' + accessMethod +
        ' |\n'
    }

    contextMessage += '\n'

    // PRD warning
    if (prdConnections.length > 0) {
      contextMessage +=
        '> ⛔ **Connections PRD:** O `hoop exec` está **permanentemente desabilitado** em produção. ' +
        'Use **exclusivamente** a API REST de runbooks (`POST /api/runbooks/exec`).\n\n'
    }

    // All connections list (compact)
    if (allConnections.length > relevantConnections.length) {
      contextMessage += '### Todas as connections disponíveis\n\n'
      contextMessage += allConnections
        .map((c) => {
          const env = getEnvironment(c.name)
          const prefix = env === 'PRD' ? '🔴 ' : ''
          return (
            '- ' + prefix + c.name +
            ' (' + (c.subtype || c.type) +
            ', ' + env +
            ', ' + c.status +
            ', exec=' + c.access_mode_exec +
            ', runbooks=' + c.access_mode_runbooks + ')'
          )
        })
        .join('\n')
      contextMessage += '\n\n'
    }

    // Runbooks section
    if (runbookConnections.length > 0) {
      contextMessage += '=== RUNBOOKS DISCOVERY ===\n\n'

      if (matchedRunbooks.length > 0) {
        contextMessage +=
          'Repository: `' + repository + '`\n\n' +
          '### Runbooks disponíveis (' +
          matchedRunbooks.length +
          ' encontrados)\n\n'

        if (resolvedPrdPaths.length > 0) {
          contextMessage +=
            '📁 **Paths conhecidos de runbooks PRD:** ' +
            resolvedPrdPaths.map((p) => '`' + p + '/`').join(', ') + '\n\n'
        }

        for (const rb of matchedRunbooks) {
          contextMessage += '- **' + rb.name + '**'

          const params = Object.entries(rb.metadata)
          if (params.length > 0) {
            const paramList = params
              .map(([key, meta]) => {
                let desc = key
                if (meta.type) desc += ' (' + meta.type
                if (meta.required) desc += ', required'
                if (meta.default) desc += ', default=' + meta.default
                if (meta.type) desc += ')'
                if (meta.description) desc += ': ' + meta.description
                return desc
              })
              .join('; ')
            contextMessage += '\n  Params: ' + paramList
          } else {
            contextMessage += ' (sem parâmetros)'
          }
          contextMessage += '\n'
        }

        contextMessage += '\n'

        // Execution template
        const exampleConn = runbookConnections[0].name
        const exampleRunbook =
          matchedRunbooks.length > 0 ? matchedRunbooks[0].name : '<file_name>'

        contextMessage +=
          '### 🚀 Como executar um runbook\n\n' +
          'Use `run_terminal_command` com o seguinte comando (ajuste connection_name, file_name e parameters):\n\n' +
          '```bash\n' +
          "HOOP_CONFIG=~/.hoop/config.toml; TOKEN=$(grep '^token' \"$HOOP_CONFIG\" | head -1 | cut -d'=' -f2 | tr -d ' \"'); API_URL=$(grep '^api_url' \"$HOOP_CONFIG\" | head -1 | cut -d'=' -f2 | tr -d ' \"'); " +
          'curl -sk -X POST "${API_URL}/api/runbooks/exec" ' +
          '-H "Authorization: Bearer ${TOKEN}" ' +
          '-H "Content-Type: application/json" ' +
          "-d '{\"connection_name\": \"" +
          exampleConn +
          '", "repository": "' +
          repository +
          '", "file_name": "' +
          exampleRunbook +
          "\", \"parameters\": {}}' < /dev/null 2>&1\n" +
          '```\n\n' +
          '**Timeout:** Use `timeout_seconds: 120`.\n' +
          '**Resposta:** O campo `output` contém o resultado direto. O campo `output_status` indica sucesso/falha.\n\n'
      } else {
        if (resolvedPrdPaths.length > 0) {
          contextMessage +=
            '📁 **Paths conhecidos de runbooks PRD:** ' +
            resolvedPrdPaths.map((p) => '`' + p + '/`').join(', ') + '\n' +
            'Verifique se existem runbooks neste path.\n\n'
        }

        contextMessage +=
          'Nenhum runbook encontrado para as connections selecionadas.\n\n'

        // If there are PRD connections with no runbooks, provide guidance
        const prdWithoutRunbooks = prdConnections.filter(
          (c) => c.access_mode_runbooks === 'enabled',
        )
        if (prdWithoutRunbooks.length > 0) {
          contextMessage +=
            '> ⚠️ **Connections PRD com runbooks habilitados mas nenhum runbook encontrado.** ' +
            'Considere:\n' +
            '> 1. Usar a connection equivalente de **HOM** onde `hoop exec` pode estar disponível\n' +
            '> 2. Solicitar a criação de um novo runbook ao time de database/infraestrutura\n\n'
        }
      }
    }

    // Strategy section — PRD-aware
    contextMessage += '### Estratégia recomendada\n\n'

    const hasMongoConnections = relevantConnections.some(
      (c) => c.subtype === 'mongodb' || c.name.includes('MGO'),
    )
    const hasMysqlConnections = relevantConnections.some(
      (c) => c.subtype === 'mysql' || c.name.includes('RDS'),
    )

    if (hasMongoConnections) {
      contextMessage +=
        '- **MongoDB detectado:** Use mongo shell syntax (db.collection.find(), etc.)\n'
    }
    if (hasMysqlConnections) {
      contextMessage +=
        '- **MySQL detectado:** Use SQL syntax (SELECT, SHOW TABLES, etc.)\n'
    }

    // PRD-specific strategy
    if (prdConnections.length > 0) {
      const prdRunbookConns = prdConnections.filter(
        (c) => c.access_mode_runbooks === 'enabled',
      )

      const homEquivalents = allConnections.filter((c) =>
        /-HOM-/i.test(c.name) &&
        prdConnections.some((prd) => {
          const prdPrefix = prd.name.replace(/-PRD-.*$/i, '')
          return c.name.toUpperCase().startsWith(prdPrefix.toUpperCase())
        }),
      )

      contextMessage += '\n**🔴 Connections PRD — SOMENTE RUNBOOKS VIA API REST:**\n'
      contextMessage +=
        '- ⛔ **\`hoop exec\` é PROIBIDO em PRD** — está permanentemente desabilitado, NÃO tente usar\n'

      if (prdRunbookConns.length > 0 && matchedRunbooks.length > 0) {
        contextMessage +=
          '- ✅ **Use runbooks via API REST** (`POST /api/runbooks/exec`) — único método permitido em PRD\n'
      } else if (prdRunbookConns.length > 0) {
        contextMessage +=
          '- ⚠️ Runbooks habilitados mas nenhum runbook matching encontrado\n'
        if (homEquivalents.length > 0) {
          contextMessage +=
            '- 💡 **Alternativas HOM disponíveis:** ' +
            homEquivalents.map((c) => '`' + c.name + '` (exec=' + c.access_mode_exec + ')').join(', ') + '\n'
        } else {
          contextMessage +=
            '- 💡 **Alternativa:** Use a connection equivalente de **HOM** (troque `-PRD-` por `-HOM-` no nome)\n'
        }
        contextMessage +=
          '- 💡 **Alternativa:** Solicite a criação de um novo runbook ao time responsável\n'
        contextMessage +=
          '- ⛔ **NÃO** tente usar `hoop exec` como fallback — é proibido em PRD\n'
      } else {
        contextMessage +=
          '- ❌ Nenhum método de acesso disponível para as connections PRD\n'
        if (homEquivalents.length > 0) {
          contextMessage +=
            '- 💡 **Alternativas HOM disponíveis:** ' +
            homEquivalents.map((c) => '`' + c.name + '` (exec=' + c.access_mode_exec + ')').join(', ') + '\n'
        } else {
          contextMessage +=
            '- 💡 **Alternativa:** Use a connection equivalente de **HOM** (troque `-PRD-` por `-HOM-` no nome)\n'
        }
        contextMessage +=
          '- ⛔ **NÃO** tente usar `hoop exec` como fallback — é proibido em PRD\n'
      }
    }

    // Non-PRD strategy
    if (nonPrdConnections.length > 0) {
      const hasRunbookNonPrd = nonPrdConnections.some(
        (c) => c.access_mode_runbooks === 'enabled',
      )
      const hasExecNonPrd = nonPrdConnections.some(
        (c) => c.access_mode_exec === 'enabled',
      )

      if (prdConnections.length > 0) {
        contextMessage += '\n**Connections não-PRD (HOM/QA/DEV):**\n'
      }

      if (hasRunbookNonPrd && matchedRunbooks.length > 0) {
        contextMessage +=
          '- ⭐ **Preferencial:** Use runbooks via API REST (`POST /api/runbooks/exec`)\n'
      }

      if (hasExecNonPrd) {
        contextMessage +=
          '- ✅ **SOMENTE para connections NÃO-PRD:** `hoop exec` com arquivo temporário + `-f` + `< /dev/null`\n'
      }

      if (!hasRunbookNonPrd && !hasExecNonPrd) {
        contextMessage +=
          '- ⚠️ Sem acesso direto nas connections não-PRD listadas\n'
      }
    }

    if (prdConnections.length === 0 && nonPrdConnections.length === 0) {
      contextMessage +=
        '- **⚠️ Sem acesso direto:** Nenhuma connection tem exec ou runbooks habilitados. Considere solicitar acesso.\n'
    }

    contextMessage +=
      '\n- **Segurança:** NUNCA execute comandos destrutivos sem confirmação do usuário\n' +
      '- **Timeout:** 120s para runbooks via API, 60-90s para hoop exec (somente não-PRD)\n'

    // Final PRD reminder
    if (prdConnections.length > 0) {
      contextMessage +=
        '\n⛔ **LEMBRETE FINAL: Para connections PRD, use SOMENTE API REST de runbooks (`POST /api/runbooks/exec`). NUNCA use `hoop exec` em PRD.**\n'
    }

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: contextMessage,
      },
      includeToolCall: false,
    }

    // Programmatic PRD exec guard: intercept and block hoop exec on PRD connections
    while (true) {
      const { agentState: currentState, stepsComplete } = yield 'STEP'

      if (prdConnectionNames.length > 0) {
        const violation = _detectPrdExecViolation(
          currentState.messageHistory,
          prdConnectionNames,
        )

        if (violation.detected) {
          logger.warn(
            '⛔ PRD exec violation detected on connection: ' +
              violation.connectionName,
          )

          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                '⛔ **BLOQUEADO PROGRAMATICAMENTE:** Tentativa de `hoop exec` detectada na connection PRD `' +
                violation.connectionName +
                '`. O `hoop exec` é **PROIBIDO** em produção.\n\n' +
                '**Use EXCLUSIVAMENTE runbooks via API REST** (`POST /api/runbooks/exec`).\n' +
                'Se não existe runbook adequado, sugira a connection equivalente de HOM ou a criação de um novo runbook.\n\n' +
                '⛔ NÃO tente `hoop exec` novamente em connections PRD.',
            },
            includeToolCall: false,
          }

          if (stepsComplete) break
          continue
        }
      }

      if (stepsComplete) break
    }
  },
}

export default definition
