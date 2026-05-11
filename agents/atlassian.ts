import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const definition: AgentDefinition = {
    id: 'atlassian',
    publisher,
    model: 'anthropic/claude-sonnet-4.6',
    displayName: 'Atlassian',
    spawnerPrompt: `Expert at querying and managing Jira issues, Confluence pages, projects, sprints, and workflows via MCP and REST API.

Use this agent to:
- Search, read, create, and update Jira issues (bugs, stories, tasks, epics)
- Search and read Confluence pages and spaces
- Get project information, boards, sprints from Jira
- Transition issue statuses, add comments, assign issues
- Create or update Confluence pages
- Fill GSTI/GMUD (change management) fields dynamically via REST API
- Discover and update custom fields on any Jira issue

Requires ATLASSIAN_API_TOKEN, ATLASSIAN_USER_EMAIL, and ATLASSIAN_BASE_URL environment variables.`,

    inputSchema: {
        prompt: {
            type: 'string',
            description:
                'What you want to do with Jira or Confluence. Be specific about project keys, issue IDs, search queries, page URLs, etc.',
        },
    },

    outputMode: 'last_message',
    includeMessageHistory: false,

    toolNames: ['run_terminal_command', 'add_message'],

    mcpServers: {
        atlassian: {
            command: '/Users/anderson.vieira/.local/bin/uvx',
            args: ['--native-tls', 'mcp-atlassian'],
            env: {
                JIRA_URL: '$ATLASSIAN_BASE_URL',
                JIRA_USERNAME: '$ATLASSIAN_USER_EMAIL',
                JIRA_API_TOKEN: '$ATLASSIAN_API_TOKEN',
                CONFLUENCE_URL: '$ATLASSIAN_BASE_URL/wiki',
                CONFLUENCE_USERNAME: '$ATLASSIAN_USER_EMAIL',
                CONFLUENCE_API_TOKEN: '$ATLASSIAN_API_TOKEN',
            },
        },
    },

    systemPrompt: `You are an Atlassian expert (Jira + Confluence). You MUST use the atlassian MCP tools to answer user questions. When MCP tools fail, use curl with the Jira REST API as fallback.

This MCP server is the Python mcp-atlassian package (v2.14+). All tool names and parameters use snake_case.

# CRITICAL RULES

1. Every tool call MUST include ALL required parameters. NEVER call a tool with empty parameters {}.
2. All parameters use snake_case (e.g., "issue_key", "project_key", "issue_type").
3. Use the atlassian/ prefix for all tool names.
4. Extract issue keys, project keys, and page IDs from the user's request.
5. **ALL IDs MUST BE STRINGS**, never numbers. page_id, board_id, sprint_id — always pass as "12345" (string), NEVER as 12345 (number). This is the #1 cause of errors.

# Jira Tool Reference

1. Get a specific issue:
   Tool: atlassian/jira_get_issue
   Parameters: {"issue_key": "PROJ-123"}

2. Search issues with JQL:
   Tool: atlassian/jira_search
   Parameters: {"jql": "project = PROJ ORDER BY created DESC", "limit": 10}

3. List all projects:
   Tool: atlassian/jira_get_all_projects
   Parameters: {}

4. Get project issues:
   Tool: atlassian/jira_get_project_issues
   Parameters: {"project_key": "PROJ", "limit": 10}

5. Create issue:
   Tool: atlassian/jira_create_issue
   Parameters: {"project_key": "PROJ", "issue_type": "Task", "summary": "Title", "description": "Details"}

6. Update issue:
   Tool: atlassian/jira_update_issue
   Parameters: {"issue_key": "PROJ-123", "fields": "{\\\\"summary\\\\": \\\\"New title\\\\"}"}

7. Add comment:
   Tool: atlassian/jira_add_comment
   Parameters: {"issue_key": "PROJ-123", "body": "Comment text"}

8. Get available transitions:
   Tool: atlassian/jira_get_transitions
   Parameters: {"issue_key": "PROJ-123"}

9. Transition issue status:
   Tool: atlassian/jira_transition_issue
   Parameters: {"issue_key": "PROJ-123", "transition_id": "21"}

10. List agile boards:
    Tool: atlassian/jira_get_agile_boards
    Parameters: {}

11. Get sprints from board:
    Tool: atlassian/jira_get_sprints_from_board
    Parameters: {"board_id": "100", "state": "active"}

12. Get sprint issues:
    Tool: atlassian/jira_get_sprint_issues
    Parameters: {"sprint_id": "200"}

# JQL Examples
- Last issues created: "project = PROJ ORDER BY created DESC"
- Open issues: "project = PROJ AND status != Done"
- Assigned to me: "assignee = currentUser()"
- My unresolved issues: "assignee = currentUser() AND resolution = Unresolved"
- Current sprint: "sprint in openSprints() AND project = PROJ"
- Created this week: "project = PROJ AND created >= -7d"
- High priority: "project = PROJ AND priority = High"

# Confluence Tool Reference

1. Read a page by ID (⚠️ page_id MUST be a STRING, not a number!):
   Tool: atlassian/confluence_get_page
   Parameters: {"page_id": "12345"}
   ❌ WRONG: {"page_id": 12345}
   ✅ CORRECT: {"page_id": "12345"}

2. Search pages with CQL:
   Tool: atlassian/confluence_search
   Parameters: {"cql": "text ~ 'keyword'"}

3. List spaces:
   Tool: atlassian/confluence_get_spaces
   Parameters: {}

# URL Parsing (Confluence)
- From URL: https://site.atlassian.net/wiki/spaces/SPACE/pages/12345/PageName
- Extract page_id: "12345" (number after /pages/)
- Extract space key: "SPACE" (after /spaces/)
- CRITICAL: Always pass page_id as a STRING with quotes, e.g. "12345", NEVER as a number 12345

# Jira REST API via curl — Fallback & GSTI/GMUD

When MCP tools fail or for advanced operations (GSTI/GMUD field management, custom field discovery, bulk updates), use curl with the Jira REST API v3. The authentication context is injected automatically via handleSteps.

## Endpoints Reference

### Get issue details
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}" < /dev/null 2>&1
\`\`\`

### Update issue fields (including custom fields)
\`\`\`bash
curl -s -X PUT -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}" -d '{"fields": {"customfield_XXXXX": "value"}}' < /dev/null 2>&1
\`\`\`

### Discover editable fields (CRITICAL for GSTI/GMUD)
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/editmeta" < /dev/null 2>&1
\`\`\`
Returns all fields that can be edited on this issue, including custom field IDs, names, types, and allowed values.

### List ALL fields (find custom field IDs by name)
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/field" < /dev/null 2>&1
\`\`\`
Use this to find the \`customfield_XXXXX\` ID for a field by its display name (e.g., "GSTI", "Plano de Rollback", "Janela de Deploy").

### Get available transitions
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/transitions" < /dev/null 2>&1
\`\`\`

### Transition issue status
\`\`\`bash
curl -s -X POST -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Content-Type: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/transitions" -d '{"transition": {"id": "21"}}' < /dev/null 2>&1
\`\`\`

### Add comment
\`\`\`bash
curl -s -X POST -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Content-Type: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/comment" -d '{"body": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Comment text"}]}]}}' < /dev/null 2>&1
\`\`\`

### Search issues with JQL
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/search?jql={URL_ENCODED_JQL}&maxResults=50" < /dev/null 2>&1
\`\`\`

## GSTI/GMUD — Change Management Workflow

GSTIs (Gestão de Mudanças) are change management tickets in Jira. Their fields vary by project and issue type, so you MUST discover them dynamically.

### Step 0: Get current field values
To see current values of ALL fields (including custom GSTI/GMUD fields), use \`?fields=*all\`:
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}?fields=*all&expand=names" < /dev/null 2>&1
\`\`\`
The \`expand=names\` parameter adds human-readable field names to the response.

### Step 1: Discover editable fields
\`\`\`bash
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/editmeta" < /dev/null 2>&1 | python3 -c '
import sys, json
data = json.load(sys.stdin)
fields = data.get("fields", {})
for fid, meta in fields.items():
    name = meta.get("name", "")
    ftype = meta.get("schema", {}).get("type", "")
    allowed = meta.get("allowedValues", [])
    allowed_str = ", ".join([str(v.get("name", v.get("value", v.get("id", "")))) for v in allowed[:5]]) if allowed else ""
    print(f"{fid}: {name} ({ftype})" + (f" — allowed: [{allowed_str}]" if allowed_str else ""))
'
\`\`\`

### Step 2: Identify GSTI/GMUD fields
Look for fields with names containing: "GSTI", "GMUD", "Mudança", "Change", "Rollback", "Deploy", "Risco", "Risk", "Evidência", "Evidence", "Impacto", "Impact", "Janela", "Window".

### Step 3: Update fields
\`\`\`bash
curl -s -X PUT -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Content-Type: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}" -d '{
  "fields": {
    "customfield_XXXXX": "value for field 1",
    "customfield_YYYYY": {"value": "option value"},
    "customfield_ZZZZZ": "2025-01-15T10:00:00.000+0000"
  }
}' < /dev/null 2>&1
\`\`\`

**Field type mapping:**
| Jira Field Type | JSON Value Format |
|---|---|
| string / textarea | \`"plain text value"\` |
| option (select) | \`{"value": "Option Name"}\` or \`{"id": "10001"}\` |
| array of options | \`[{"value": "Opt1"}, {"value": "Opt2"}]\` |
| date | \`"2025-01-15"\` |
| datetime | \`"2025-01-15T10:00:00.000+0000"\` |
| number | \`42\` or \`3.14\` |
| user | \`{"accountId": "5b10ac8d82e05b22cc7d4ef5"}\` |

### Step 4: Transition status (if needed)
After filling fields, transition the GSTI to the next status:
\`\`\`bash
# 1. Get available transitions
curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/transitions" < /dev/null 2>&1

# 2. Execute transition
curl -s -X POST -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Content-Type: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}/transitions" -d '{"transition": {"id": "TRANSITION_ID"}}' < /dev/null 2>&1
\`\`\`
`,

    instructionsPrompt: `Execute the user's request using the atlassian MCP tools. If an MCP tool fails, retry the same operation using curl with the Jira REST API as fallback.

Steps:
1. Extract any issue keys (e.g., CONSO-2183), project keys, or page IDs from the user's request. When the user shares a Jira URL (e.g., https://picpay.atlassian.net/browse/CONSO-2434), extract the issue key and proactively fetch ALL relevant details for implementation.
2. Choose the appropriate atlassian/ tool
3. Build the correct parameters using snake_case — "issue_key" for jira_get_issue, "jql" for jira_search, "cql" for confluence_search
4. Call the tool with ALL required parameters filled in
5. Present results clearly

For "my issues" or "my sprint" requests, use jira_search with JQL:
- My issues: {"jql": "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC"}
- Current sprint: {"jql": "sprint in openSprints() AND assignee = currentUser()"}

ALWAYS include issue keys (e.g., PROJ-123) in your responses.
ALWAYS use the atlassian/ prefix for tool names.
NEVER omit required parameters like issue_key — extract them from the user's message.
CRITICAL: page_id, board_id, sprint_id must ALWAYS be strings ("12345"), NEVER numbers (12345). This applies to ALL ID parameters.
If a tool call fails with a type error about "expected string, received number", retry passing the ID as a string with quotes.
If a tool call fails, try an alternative approach or report the error clearly.

## CONSO Project (ms-consortium)

CONSO project tickets (consórcios) may not have the "Acceptance Criteria" field formally filled. In that case, use the "Correção Sugerida" section or similar instructions in the description as a functional substitute for implementation criteria.

## Response format for implementation

When the user asks for ticket details for implementation, always include an **"Executive Summary for Implementation"** at the end with: affected service, specific component, database/collection affected, quantified impact, and required actions in a concise format. End with a suggested next step (e.g., search code on GitHub).

## MCP Fallback via curl

If any MCP tool call fails with an error (connection refused, timeout, tool not found, parameter error, etc.):
1. **Do NOT give up** — retry the same operation using curl with the Jira REST API
2. The curl uses env var references: \`-u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN"\` and \`$ATLASSIAN_BASE_URL\` — already configured
3. Use the curl endpoints documented in the system prompt
4. Example fallback: if \`atlassian/jira_get_issue\` fails, use:
   \`\`\`bash
   curl -s -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" -H "Accept: application/json" "$ATLASSIAN_BASE_URL/rest/api/3/issue/{issueKey}" < /dev/null 2>&1
   \`\`\`
5. For field updates that MCP cannot handle (custom fields, GSTI/GMUD), go directly to curl

## GSTI/GMUD — Change Management

When the user asks to fill or update GSTI/GMUD fields:
1. First discover the editable fields: \`GET /rest/api/3/issue/{issueKey}/editmeta\`
2. Identify GSTI/GMUD-related custom fields by name
3. Update the fields via \`PUT /rest/api/3/issue/{issueKey}\`
4. If needed, transition the issue status via \`POST /rest/api/3/issue/{issueKey}/transitions\`
5. Use \`timeout_seconds: 30\` for most curl commands

Always present which fields were found, their current values, and what was updated.
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

        function extractIssueKey(text: string): string | null {
            const urlMatch = text.match(
                /https?:\/\/[^/]+\/browse\/([A-Z][A-Z0-9]+-\d+)/,
            )
            if (urlMatch) return urlMatch[1]

            const keyMatch = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)
            if (keyMatch) return keyMatch[1]

            return null
        }

        logger.info('Reading Atlassian credentials...')

        let baseUrl = ''
        let email = ''
        let apiToken = ''

        try {
            baseUrl =
                (typeof process !== 'undefined' &&
                    process.env?.ATLASSIAN_BASE_URL) ||
                ''
            email =
                (typeof process !== 'undefined' &&
                    process.env?.ATLASSIAN_USER_EMAIL) ||
                ''
            apiToken =
                (typeof process !== 'undefined' &&
                    process.env?.ATLASSIAN_API_TOKEN) ||
                ''
        } catch {
            // process.env may not be available in sandbox context
        }

        if (!baseUrl || !email || !apiToken) {
            const envScript = [
                'BASE_URL="$ATLASSIAN_BASE_URL"',
                'EMAIL="$ATLASSIAN_USER_EMAIL"',
                'TOKEN="$ATLASSIAN_API_TOKEN"',
                'for f in .env.local .env; do',
                '  if [ -f "$f" ]; then',
                '    [ -z "$BASE_URL" ] && BASE_URL=$(grep "^ATLASSIAN_BASE_URL=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\\"\\x27]//;s/[\\"\\x27]$//")',
                '    [ -z "$EMAIL" ] && EMAIL=$(grep "^ATLASSIAN_USER_EMAIL=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\\"\\x27]//;s/[\\"\\x27]$//")',
                '    [ -z "$TOKEN" ] && TOKEN=$(grep "^ATLASSIAN_API_TOKEN=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^[\\"\\x27]//;s/[\\"\\x27]$//")',
                '  fi',
                'done',
                'if [ -z "$BASE_URL" ] || [ -z "$EMAIL" ] || [ -z "$TOKEN" ]; then',
                '  for f in ~/.zshrc ~/.bashrc ~/.bash_profile ~/.zprofile ~/.profile; do',
                '    if [ -f "$f" ]; then',
                '      set +e; . "$f" >/dev/null 2>&1; set -e',
                '      [ -z "$BASE_URL" ] && BASE_URL="$ATLASSIAN_BASE_URL"',
                '      [ -z "$EMAIL" ] && EMAIL="$ATLASSIAN_USER_EMAIL"',
                '      [ -z "$TOKEN" ] && TOKEN="$ATLASSIAN_API_TOKEN"',
                '      [ -n "$BASE_URL" ] && [ -n "$EMAIL" ] && [ -n "$TOKEN" ] && break',
                '    fi',
                '  done',
                'fi',
                'printf "%s\\n%s\\n%s" "$BASE_URL" "$EMAIL" "$TOKEN"',
            ].join('\n')

            const { toolResult: envResult } = yield {
                toolName: 'run_terminal_command',
                input: { command: envScript, timeout_seconds: 10 },
            }

            const envOutput = extractStdout(envResult).trim()
            const lines = envOutput.split('\n')

            if (!baseUrl && lines[0]) baseUrl = lines[0].trim()
            if (!email && lines[1]) email = lines[1].trim()
            if (!apiToken && lines[2]) apiToken = lines[2].trim()
        }

        if (!baseUrl || !email || !apiToken) {
            const missing: string[] = []
            if (!baseUrl) missing.push('ATLASSIAN_BASE_URL')
            if (!email) missing.push('ATLASSIAN_USER_EMAIL')
            if (!apiToken) missing.push('ATLASSIAN_API_TOKEN')

            logger.info('Missing env vars: ' + missing.join(', '))

            yield {
                toolName: 'add_message',
                input: {
                    role: 'user',
                    content:
                        '❌ Variáveis de ambiente Atlassian não configuradas: `' +
                        missing.join('`, `') +
                        '`\n\n' +
                        'Configure no `.env.local` ou como variáveis de ambiente:\n' +
                        '```bash\n' +
                        'export ATLASSIAN_BASE_URL="https://your-site.atlassian.net"\n' +
                        'export ATLASSIAN_USER_EMAIL="your-email@company.com"\n' +
                        'export ATLASSIAN_API_TOKEN="your-api-token"\n' +
                        '```\n\n' +
                        'O API Token pode ser gerado em: https://id.atlassian.com/manage-profile/security/api-tokens',
                },
                includeToolCall: false,
            }
            yield 'STEP_ALL'
            return
        }

        // Remove trailing slash from base URL
        baseUrl = baseUrl.replace(/\/+$/, '')

        logger.info('Validating Atlassian credentials against ' + baseUrl + '...')

        const validateCmd =
            'curl -s -w "\\n%{http_code}" -u "' +
            email +
            ':' +
            apiToken +
            '" -H "Accept: application/json" "' +
            baseUrl +
            '/rest/api/3/myself" < /dev/null 2>/dev/null'

        const { toolResult: validateResult } = yield {
            toolName: 'run_terminal_command',
            input: { command: validateCmd, timeout_seconds: 15 },
        }

        const validateOutput = extractStdout(validateResult).trim()
        const lastNewline = validateOutput.lastIndexOf('\n')
        const httpStatus =
            lastNewline >= 0
                ? validateOutput.slice(lastNewline + 1).trim()
                : validateOutput.trim()
        const responseBody =
            lastNewline >= 0
                ? validateOutput.slice(0, lastNewline).trim()
                : ''

        const isValid = httpStatus.startsWith('2')

        if (!isValid) {
            logger.info('Validation failed: HTTP ' + httpStatus)

            let errorDetail = ''
            try {
                const parsed = JSON.parse(responseBody) as Record<
                    string,
                    unknown
                >
                errorDetail = String(
                    parsed.message || parsed.errorMessages || '',
                )
            } catch {
                errorDetail = responseBody.slice(0, 200)
            }

            yield {
                toolName: 'add_message',
                input: {
                    role: 'user',
                    content:
                        '❌ Falha na autenticação Atlassian (HTTP ' +
                        httpStatus +
                        ').\n\n' +
                        (errorDetail
                            ? '**Detalhe:** ' + errorDetail + '\n\n'
                            : '') +
                        'Possíveis causas:\n' +
                        '1. API Token expirado ou revogado\n' +
                        '2. Email incorreto em `ATLASSIAN_USER_EMAIL`\n' +
                        '3. URL base incorreta em `ATLASSIAN_BASE_URL`\n\n' +
                        'Verifique as credenciais e tente novamente.\n' +
                        'Gere um novo token em: https://id.atlassian.com/manage-profile/security/api-tokens',
                },
                includeToolCall: false,
            }
            yield 'STEP_ALL'
            return
        }

        let displayName = ''
        try {
            const parsed = JSON.parse(responseBody) as Record<string, unknown>
            displayName = String(parsed.displayName || parsed.emailAddress || email)
        } catch {
            displayName = email
        }

        logger.info(
            'Atlassian auth valid ✅ (user: ' + displayName + ')',
        )

        // Build curl auth using -u flag with env var references (credentials resolved at shell execution time)
        const curlAuth = '-u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN"'

        let contextMessage =
            '=== ATLASSIAN API CONTEXT ===\n\n' +
            '**Usuário:** ' + displayName + '\n' +
            '**Base URL:** `' + baseUrl + '`\n' +
            '**Autenticação:** API Token ✅\n\n'

        contextMessage +=
            '### curl — Autenticação\n\n' +
            'Use `-u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN"` em todos os comandos curl. As variáveis de ambiente já estão configuradas.\n\n'

        contextMessage +=
            '### Exemplos de curl prontos\n\n' +
            '**Get issue:**\n' +
            '```bash\n' +
            'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}" < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Discover editable fields (GSTI/GMUD):**\n' +
            '```bash\n' +
            'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}/editmeta" < /dev/null 2>&1\n' +
            '```\n\n' +
            '**List ALL fields (find custom field IDs):**\n' +
            '```bash\n' +
            'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/field" < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Update issue fields:**\n' +
            '```bash\n' +
            'curl -s -X PUT ' + curlAuth + ' -H "Content-Type: application/json" -H "Accept: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}" -d \'{"fields": {"customfield_XXXXX": "value"}}\' < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Get transitions:**\n' +
            '```bash\n' +
            'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}/transitions" < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Transition issue:**\n' +
            '```bash\n' +
            'curl -s -X POST ' + curlAuth + ' -H "Content-Type: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}/transitions" -d \'{"transition": {"id": "TRANSITION_ID"}}\' < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Search with JQL:**\n' +
            '```bash\n' +
            'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/search?jql={URL_ENCODED_JQL}&maxResults=50" < /dev/null 2>&1\n' +
            '```\n\n' +
            '**Add comment:**\n' +
            '```bash\n' +
            'curl -s -X POST ' + curlAuth + ' -H "Content-Type: application/json" "' + baseUrl + '/rest/api/3/issue/{issueKey}/comment" -d \'{"body": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Comment"}]}]}}\' < /dev/null 2>&1\n' +
            '```\n\n'

        contextMessage +=
            '### Dicas\n' +
            '- Use `timeout_seconds: 30` para a maioria dos comandos curl\n' +
            '- SEMPRE inclua `< /dev/null 2>&1` no final dos comandos curl\n' +
            '- Para GSTI/GMUD: primeiro descubra os campos com editmeta, depois atualize com PUT\n' +
            '- Se MCP falhar, use curl como fallback com os templates acima\n' +
            '- URL-encode JQL queries antes de passar na URL\n'

        // If prompt contains an issue key, pre-fetch it for context
        const issueKey = extractIssueKey(prompt || '')
        if (issueKey) {
            logger.info('Issue key detected: ' + issueKey + ', adding to context')
            contextMessage +=
                '\n**Issue detectada no prompt:** `' + issueKey + '`\n' +
                'Se precisar de campos editáveis ou GSTI, use editmeta:\n' +
                '```bash\n' +
                'curl -s ' + curlAuth + ' -H "Accept: application/json" "' + baseUrl + '/rest/api/3/issue/' + issueKey + '/editmeta" < /dev/null 2>&1\n' +
                '```\n'
        }

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
