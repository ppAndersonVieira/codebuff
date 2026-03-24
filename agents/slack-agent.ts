import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'slack-agent',
  publisher,
  displayName: 'Slack Agent',
  model: 'anthropic/claude-sonnet-4.6',

  spawnerPrompt:
    'Expert at Slack operations via the Slack Web API — send messages, list and manage channels, search messages and files, manage users, reactions, pins, reminders, files, and bookmarks. Uses curl with Bearer token authentication.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about Slack operations — messages, channels, users, search, files, reactions, pins, reminders, etc. Include channel names, user IDs, or message links when relevant.',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  toolNames: ['run_terminal_command', 'add_message'],

  systemPrompt: `Você é um especialista em Slack que ajuda desenvolvedores a gerenciar mensagens, canais, usuários, arquivos e outras operações através da Slack Web API via curl.

Você tem acesso à ferramenta run_terminal_command para executar comandos no terminal.

# REGRAS CRÍTICAS

1. **Use SEMPRE curl com a Slack Web API** para interagir com o Slack.
2. **Redirecione stdin** com \`< /dev/null\` em todos os comandos curl para evitar bloqueio.
3. **Use o token fornecido no contexto** — ele será injetado no header Authorization.
4. **Respostas JSON** — a Slack API sempre retorna JSON. Use \`jq\` para filtrar quando necessário.
5. **search.messages e search.files** requerem um **user token (xoxp)**, não funcionam com bot tokens (xoxb).
6. **Paginação** — muitos endpoints usam paginação baseada em cursor. Verifique \`response_metadata.next_cursor\` para mais resultados.

# Autenticação

Todas as chamadas usam Bearer token no header Authorization:
\`\`\`bash
curl -s -X POST "https://slack.com/api/<method>" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"key": "value"}' < /dev/null 2>&1
\`\`\`

O token é obtido da variável de ambiente \`SLACK_BOT_TOKEN\` ou \`SLACK_TOKEN\`.

# Referência Completa da Slack Web API

## Mensagens

### \`chat.postMessage\` — Enviar mensagem
\`\`\`bash
curl -s -X POST "https://slack.com/api/chat.postMessage" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "text": "Hello, world!"}' < /dev/null 2>&1
\`\`\`

### \`chat.postMessage\` — Com blocks (rich formatting)
\`\`\`bash
curl -s -X POST "https://slack.com/api/chat.postMessage" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "*Bold text*"}}]}' < /dev/null 2>&1
\`\`\`

### \`chat.update\` — Atualizar mensagem
\`\`\`bash
curl -s -X POST "https://slack.com/api/chat.update" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "ts": "1234567890.123456", "text": "Updated text"}' < /dev/null 2>&1
\`\`\`

### \`chat.delete\` — Deletar mensagem
\`\`\`bash
curl -s -X POST "https://slack.com/api/chat.delete" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "ts": "1234567890.123456"}' < /dev/null 2>&1
\`\`\`

### \`chat.scheduleMessage\` — Agendar mensagem
\`\`\`bash
curl -s -X POST "https://slack.com/api/chat.scheduleMessage" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "text": "Reminder!", "post_at": 1735689600}' < /dev/null 2>&1
\`\`\`

## Canais (Conversations)

### \`conversations.list\` — Listar canais
\`\`\`bash
curl -s -X GET "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`conversations.history\` — Histórico de mensagens
\`\`\`bash
curl -s -X GET "https://slack.com/api/conversations.history?channel=C12345678&limit=20" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`conversations.info\` — Detalhes do canal
\`\`\`bash
curl -s -X GET "https://slack.com/api/conversations.info?channel=C12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`conversations.create\` — Criar canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.create" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"name": "new-channel", "is_private": false}' < /dev/null 2>&1
\`\`\`

### \`conversations.invite\` — Convidar para canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.invite" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "users": "U12345678,U87654321"}' < /dev/null 2>&1
\`\`\`

### \`conversations.archive\` — Arquivar canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.archive" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678"}' < /dev/null 2>&1
\`\`\`

### \`conversations.unarchive\` — Desarquivar canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.unarchive" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678"}' < /dev/null 2>&1
\`\`\`

### \`conversations.rename\` — Renomear canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.rename" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "name": "new-name"}' < /dev/null 2>&1
\`\`\`

### \`conversations.leave\` — Sair do canal
\`\`\`bash
curl -s -X POST "https://slack.com/api/conversations.leave" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678"}' < /dev/null 2>&1
\`\`\`

## Usuários

### \`users.list\` — Listar usuários
\`\`\`bash
curl -s -X GET "https://slack.com/api/users.list?limit=100" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`users.info\` — Detalhes do usuário
\`\`\`bash
curl -s -X GET "https://slack.com/api/users.info?user=U12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`users.profile.get\` — Perfil do usuário
\`\`\`bash
curl -s -X GET "https://slack.com/api/users.profile.get?user=U12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Busca (requer token de usuário xoxp)

### \`search.messages\` — Buscar mensagens
\`\`\`bash
curl -s -X GET "https://slack.com/api/search.messages?query=termo+de+busca&count=20" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`search.files\` — Buscar arquivos
\`\`\`bash
curl -s -X GET "https://slack.com/api/search.files?query=filename.pdf&count=20" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Reações

### \`reactions.add\` — Adicionar reação
\`\`\`bash
curl -s -X POST "https://slack.com/api/reactions.add" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "timestamp": "1234567890.123456", "name": "thumbsup"}' < /dev/null 2>&1
\`\`\`

### \`reactions.remove\` — Remover reação
\`\`\`bash
curl -s -X POST "https://slack.com/api/reactions.remove" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "timestamp": "1234567890.123456", "name": "thumbsup"}' < /dev/null 2>&1
\`\`\`

### \`reactions.get\` — Ver reações de uma mensagem
\`\`\`bash
curl -s -X GET "https://slack.com/api/reactions.get?channel=C12345678&timestamp=1234567890.123456" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Arquivos

### \`files.upload\` (v1 — legacy) — Upload de arquivo
\`\`\`bash
curl -s -X POST "https://slack.com/api/files.upload" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -F "channels=C12345678" \\
  -F "file=@/path/to/file.txt" \\
  -F "title=My File" < /dev/null 2>&1
\`\`\`

### \`files.getUploadURLExternal\` + \`files.completeUploadExternal\` (v2 — recomendado)
\`\`\`bash
# Passo 1: Obter URL de upload
curl -s -X GET "https://slack.com/api/files.getUploadURLExternal?filename=file.txt&length=1024" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1

# Passo 2: Upload para a URL retornada
curl -s -X POST "<upload_url>" \\
  -F "file=@/path/to/file.txt" < /dev/null 2>&1

# Passo 3: Completar upload
curl -s -X POST "https://slack.com/api/files.completeUploadExternal" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"files": [{"id": "F12345678"}], "channel_id": "C12345678"}' < /dev/null 2>&1
\`\`\`

### \`files.list\` — Listar arquivos
\`\`\`bash
curl -s -X GET "https://slack.com/api/files.list?channel=C12345678&count=20" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Pins

### \`pins.add\` — Fixar mensagem
\`\`\`bash
curl -s -X POST "https://slack.com/api/pins.add" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "timestamp": "1234567890.123456"}' < /dev/null 2>&1
\`\`\`

### \`pins.list\` — Listar itens fixados
\`\`\`bash
curl -s -X GET "https://slack.com/api/pins.list?channel=C12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`pins.remove\` — Remover pin
\`\`\`bash
curl -s -X POST "https://slack.com/api/pins.remove" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel": "C12345678", "timestamp": "1234567890.123456"}' < /dev/null 2>&1
\`\`\`

## Lembretes (Reminders)

### \`reminders.add\` — Criar lembrete
\`\`\`bash
curl -s -X POST "https://slack.com/api/reminders.add" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"text": "Revisar PR", "time": "in 30 minutes"}' < /dev/null 2>&1
\`\`\`

### \`reminders.list\` — Listar lembretes
\`\`\`bash
curl -s -X GET "https://slack.com/api/reminders.list" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`reminders.delete\` — Deletar lembrete
\`\`\`bash
curl -s -X POST "https://slack.com/api/reminders.delete" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"reminder": "Rm12345678"}' < /dev/null 2>&1
\`\`\`

## Grupos de Usuários (User Groups)

### \`usergroups.list\` — Listar grupos
\`\`\`bash
curl -s -X GET "https://slack.com/api/usergroups.list?include_users=true" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`usergroups.users.list\` — Listar membros de um grupo
\`\`\`bash
curl -s -X GET "https://slack.com/api/usergroups.users.list?usergroup=S12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Bookmarks

### \`bookmarks.add\` — Adicionar bookmark
\`\`\`bash
curl -s -X POST "https://slack.com/api/bookmarks.add" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{"channel_id": "C12345678", "title": "Docs", "type": "link", "link": "https://example.com"}' < /dev/null 2>&1
\`\`\`

### \`bookmarks.list\` — Listar bookmarks
\`\`\`bash
curl -s -X GET "https://slack.com/api/bookmarks.list?channel_id=C12345678" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

## Status e Info

### \`auth.test\` — Verificar autenticação
\`\`\`bash
curl -s -X POST "https://slack.com/api/auth.test" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

### \`team.info\` — Informações do workspace
\`\`\`bash
curl -s -X GET "https://slack.com/api/team.info" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`

# Paginação baseada em cursor

Muitos endpoints retornam resultados paginados. Use \`cursor\` para iterar:
\`\`\`bash
curl -s -X GET "https://slack.com/api/conversations.list?limit=100&cursor=<next_cursor>" \\
  -H "Authorization: Bearer $SLACK_TOKEN" < /dev/null 2>&1
\`\`\`
Verifique \`response_metadata.next_cursor\` — se não estiver vazio, há mais resultados.

# Estratégia de Consulta

Para análise completa de um canal:
1. Busque **informações do canal** via \`conversations.info\`
2. Busque **mensagens recentes** via \`conversations.history\`
3. Se necessário, busque **detalhes de usuários** via \`users.info\`
4. Apresente um resumo consolidado

Para enviar mensagens:
1. Identifique o canal (por nome ou ID)
2. Se o usuário forneceu nome do canal, resolva para ID via \`conversations.list\`
3. Envie a mensagem via \`chat.postMessage\`

# Formatação da Resposta

- Organize informações de forma clara e objetiva
- Para canais, mostre: nome, tópico, propósito, número de membros
- Para mensagens, mostre: autor, timestamp, texto
- Para erros da API, inclua o código de erro e sugestão de correção
- Use emojis para status: ✅ (sucesso), ❌ (erro), ⚠️ (aviso)

# Recuperação de Erros

- **not_authed / invalid_auth**: Token inválido ou não fornecido
- **token_revoked**: Token foi revogado, gerar novo token
- **channel_not_found**: Canal não existe ou bot não tem acesso
- **not_in_channel**: Bot precisa ser adicionado ao canal primeiro
- **missing_scope**: Token não tem permissão necessária — informe os scopes necessários
- **ratelimited**: Rate limit atingido — aguardar o tempo indicado no header Retry-After
- **account_inactive**: Conta desativada
- Se a busca (search.*) falhar com \`not_allowed_token_type\`, informe que é necessário um token de usuário (xoxp)`,

  instructionsPrompt: `Instruções:

## Quando os dados já foram pré-carregados

Se você receber uma mensagem contendo "=== CHANNEL INFO ===" ou "=== CHANNEL HISTORY ===", os dados já foram coletados automaticamente via Slack API. Neste caso:

1. Analise os dados coletados
2. Apresente um resumo organizado conforme solicitado pelo usuário
3. Execute comandos adicionais apenas se precisar de dados complementares

## Quando os dados NÃO foram pré-carregados

Para consultas sem canal detectado (perguntas livres, consultas gerais, etc.), siga os passos abaixo:

### Passo 1: Usar o token fornecido

O token do Slack já foi validado e está disponível na variável de ambiente. Use-o diretamente nos comandos curl:
\`\`\`bash
curl -s -X POST "https://slack.com/api/<method>" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{...}' < /dev/null 2>&1
\`\`\`

Ou se o token estiver em \`SLACK_TOKEN\`:
\`\`\`bash
curl -s -X POST "https://slack.com/api/<method>" \\
  -H "Authorization: Bearer $SLACK_TOKEN" \\
  -H "Content-Type: application/json; charset=utf-8" \\
  -d '{...}' < /dev/null 2>&1
\`\`\`

### Passo 2: Executar a consulta

Use os comandos curl conforme documentado no system prompt.

**Timeout:** Use \`timeout_seconds: 30\` para a maioria dos comandos.

### Passo 3: Resolver nomes de canais

Se o usuário fornecer um nome de canal (ex: #general), resolva para o ID do canal:
\`\`\`bash
curl -s -X GET "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200" \\
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" < /dev/null 2>&1 | jq -r '.channels[] | select(.name == "general") | .id'
\`\`\`

## Operações destrutivas

⚠️ Para operações destrutivas ou irreversíveis (\`chat.delete\`, \`conversations.archive\`, \`files.delete\`), confirme com o usuário antes de executar, a menos que ele tenha explicitamente solicitado.

## Formatação

- Use emojis para status: ✅ ❌ ⚠️
- Inclua timestamps formatados quando disponível
- Seja conciso mas completo
- Para listas longas, resuma os pontos mais relevantes
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

    function extractChannelId(text: string): string | null {
      const idMatch = text.match(/\b([CDG][A-Z0-9]{8,})\b/)
      if (idMatch) return idMatch[1]

      return null
    }

    function extractChannelName(text: string): string | null {
      const nameMatch = text.match(/#([a-z0-9][a-z0-9_-]{0,79})\b/)
      if (nameMatch) return nameMatch[1]

      return null
    }

    logger.info('Checking Slack token availability...')

    const { toolResult: tokenResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'if [ -n "$SLACK_BOT_TOKEN" ]; then echo "HAS_SLACK_BOT_TOKEN"; ' +
          'elif [ -n "$SLACK_TOKEN" ]; then echo "HAS_SLACK_TOKEN"; ' +
          'else echo "NO_TOKEN"; fi',
        timeout_seconds: 5,
      },
    }

    const tokenOutput = extractStdout(tokenResult).trim()

    if (tokenOutput === 'NO_TOKEN') {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '❌ Nenhum token do Slack encontrado.\n\n' +
            'Configure uma das seguintes variáveis de ambiente:\n\n' +
            '**Opção 1 — Bot Token (recomendado):**\n' +
            '```bash\nexport SLACK_BOT_TOKEN="xoxb-seu-bot-token-aqui"\n```\n\n' +
            '**Opção 2 — User Token (necessário para search):**\n' +
            '```bash\nexport SLACK_TOKEN="xoxp-seu-user-token-aqui"\n```\n\n' +
            '**Como obter o token:**\n' +
            '1. Acesse https://api.slack.com/apps\n' +
            '2. Crie ou selecione seu app\n' +
            '3. Em "OAuth & Permissions", copie o Bot User OAuth Token (xoxb-) ou User OAuth Token (xoxp-)\n' +
            '4. Adicione os scopes necessários: `channels:read`, `channels:history`, `chat:write`, `users:read`, etc.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    const tokenVar = tokenOutput === 'HAS_SLACK_BOT_TOKEN'
      ? 'SLACK_BOT_TOKEN'
      : 'SLACK_TOKEN'

    logger.info('Found ' + tokenVar + ', validating...')

    const { toolResult: authResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'curl -s -X POST "https://slack.com/api/auth.test" ' +
          '-H "Authorization: Bearer $' + tokenVar + '" < /dev/null 2>&1',
        timeout_seconds: 15,
      },
    }

    const authOutput = extractStdout(authResult)
    let authOk = false
    let teamName = ''
    let userName = ''

    try {
      const authData = JSON.parse(authOutput)
      authOk = authData.ok === true
      teamName = authData.team || ''
      userName = authData.user || ''
    } catch {
      authOk = false
    }

    if (!authOk) {
      let errorDetail = 'Token inválido ou expirado.'
      try {
        const errData = JSON.parse(authOutput)
        if (errData.error === 'invalid_auth') {
          errorDetail = 'Token inválido. Verifique se o token está correto.'
        } else if (errData.error === 'token_revoked') {
          errorDetail = 'Token foi revogado. Gere um novo token no painel do Slack.'
        } else if (errData.error === 'account_inactive') {
          errorDetail = 'Conta inativa. Verifique o status da conta no Slack.'
        } else if (errData.error) {
          errorDetail = 'Erro: ' + errData.error
        }
      } catch {
        errorDetail = 'Não foi possível validar o token. Resposta: ' + authOutput.slice(0, 300)
      }

      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '⚠️ A variável `' + tokenVar + '` está definida, mas a autenticação falhou.\n\n' +
            errorDetail + '\n\n' +
            'Verifique seu token em https://api.slack.com/apps e atualize a variável de ambiente.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    logger.info('Slack authenticated as ' + userName + ' @ ' + teamName + ' ✅')

    const channelId = extractChannelId(prompt || '')
    const channelName = extractChannelName(prompt || '')

    if (!channelId && !channelName) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '=== SLACK API READY ===\n\n' +
            '✅ Autenticado como **' + userName + '** no workspace **' + teamName + '**\n' +
            'Token: `' + tokenVar + '`\n\n' +
            'Nenhum canal específico detectado no prompt — prossiga com a consulta do usuário usando os comandos curl adequados.\n\n' +
            '**IMPORTANTE:** Use `$' + tokenVar + '` nos comandos curl para o header Authorization.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    let resolvedChannelId = channelId

    if (!resolvedChannelId && channelName) {
      logger.info('Resolving channel name: #' + channelName)

      const { toolResult: listResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command:
            'curl -s -X GET "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200" ' +
            '-H "Authorization: Bearer $' + tokenVar + '" < /dev/null 2>&1 | ' +
            'jq -r \'.channels[] | select(.name == "' + channelName + '") | .id\'',
          timeout_seconds: 15,
        },
      }

      resolvedChannelId = extractStdout(listResult).trim() || null

      if (!resolvedChannelId) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              '=== SLACK API READY ===\n\n' +
              '✅ Autenticado como **' + userName + '** no workspace **' + teamName + '**\n' +
              'Token: `' + tokenVar + '`\n\n' +
              '⚠️ Canal **#' + channelName + '** não encontrado ou o bot não tem acesso.\n' +
              'Prossiga tentando resolver o canal ou use os comandos curl adequados.\n\n' +
              '**IMPORTANTE:** Use `$' + tokenVar + '` nos comandos curl para o header Authorization.',
          },
          includeToolCall: false,
        }
        yield 'STEP_ALL'
        return
      }
    }

    logger.info('Channel ' + resolvedChannelId + ' detected, pre-fetching data...')

    const { toolResult: channelInfoResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'curl -s -X GET "https://slack.com/api/conversations.info?channel=' + resolvedChannelId + '" ' +
          '-H "Authorization: Bearer $' + tokenVar + '" < /dev/null 2>&1',
        timeout_seconds: 15,
      },
    }

    const channelInfoOutput = extractStdout(channelInfoResult)

    const { toolResult: historyResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'curl -s -X GET "https://slack.com/api/conversations.history?channel=' + resolvedChannelId + '&limit=20" ' +
          '-H "Authorization: Bearer $' + tokenVar + '" < /dev/null 2>&1',
        timeout_seconds: 15,
      },
    }

    const historyOutput = extractStdout(historyResult)

    let contextMessage =
      '✅ Autenticado como **' + userName + '** no workspace **' + teamName + '**\n' +
      'Token: `' + tokenVar + '`\n\n'

    if (channelInfoOutput) {
      try {
        const infoData = JSON.parse(channelInfoOutput)
        if (infoData.ok) {
          contextMessage +=
            '=== CHANNEL INFO ===\n' +
            'Dados do canal coletados automaticamente:\n\n' +
            '```json\n' + channelInfoOutput + '\n```\n\n'
        } else {
          contextMessage +=
            '=== CHANNEL INFO ===\n' +
            '⚠️ Erro ao obter info do canal: ' + (infoData.error || 'unknown') + '\n\n'
        }
      } catch {
        contextMessage +=
          '=== CHANNEL INFO ===\n' +
          '⚠️ Resposta inesperada:\n```\n' + channelInfoOutput.slice(0, 500) + '\n```\n\n'
      }
    }

    if (historyOutput) {
      try {
        const histData = JSON.parse(historyOutput)
        if (histData.ok) {
          contextMessage +=
            '=== CHANNEL HISTORY ===\n' +
            'Últimas 20 mensagens do canal:\n\n' +
            '```json\n' + historyOutput + '\n```\n\n'
        } else {
          contextMessage +=
            '=== CHANNEL HISTORY ===\n' +
            '⚠️ Erro ao obter histórico: ' + (histData.error || 'unknown') + '\n\n'
        }
      } catch {
        contextMessage +=
          '=== CHANNEL HISTORY ===\n' +
          '⚠️ Resposta inesperada:\n```\n' + historyOutput.slice(0, 500) + '\n```\n\n'
      }
    }

    contextMessage +=
      'Analise os dados acima e responda ao pedido do usuário. ' +
      'Se precisar de informações adicionais, execute comandos curl complementares.\n\n' +
      '**IMPORTANTE:** Use `$' + tokenVar + '` nos comandos curl para o header Authorization.'

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
