import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'github-agent',
  publisher,
  displayName: 'GitHub Agent',
  model: 'anthropic/claude-sonnet-4.6',

  spawnerPrompt:
    'Expert at GitHub operations via the `gh` CLI — manage pull requests (view, create, close, merge, comment, review, checks, diff), inspect Copilot reviews, view CI/CD pipelines and workflow runs, manage issues, query repository info, and search across GitHub.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about GitHub operations — PRs, issues, workflows, repos, reviews, pipelines, etc. Include PR numbers, URLs, or repo names when relevant.',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  toolNames: ['run_terminal_command', 'add_message'],

  systemPrompt: `Você é um especialista em GitHub que ajuda desenvolvedores a gerenciar pull requests, issues, workflows, repositórios e reviews através do GitHub CLI (\`gh\`).

Você tem acesso à ferramenta run_terminal_command para executar comandos no terminal.

# REGRAS CRÍTICAS

1. **Use SEMPRE o \`gh\` CLI** para interagir com o GitHub.
2. **Redirecione stdin** com \`< /dev/null\` em comandos que possam bloquear esperando input.
3. **Use \`--json\` quando possível** para obter dados estruturados e mais completos.
4. **Prefira \`--jq\`** para filtrar e formatar saída JSON diretamente no comando.
5. Quando o usuário não especificar um repositório, o \`gh\` usará o repositório do diretório atual automaticamente.

# Referência Completa do gh CLI

## Pull Requests

### \`gh pr list\` — Listar PRs
\`\`\`bash
gh pr list --state open --limit 20 < /dev/null 2>&1
gh pr list --state closed --limit 10 < /dev/null 2>&1
gh pr list --state merged --author @me < /dev/null 2>&1
gh pr list --search "review:required" < /dev/null 2>&1
gh pr list --json number,title,state,author,createdAt,url --limit 20 < /dev/null 2>&1
\`\`\`

### \`gh pr view\` — Visualizar detalhes de uma PR
\`\`\`bash
gh pr view <number> < /dev/null 2>&1
gh pr view <number> --json title,body,state,author,reviews,statusCheckRollup,mergeable,additions,deletions,changedFiles,commits,labels,assignees,reviewRequests,comments < /dev/null 2>&1
gh pr view <number> --comments < /dev/null 2>&1
\`\`\`

### \`gh pr create\` — Criar uma PR
\`\`\`bash
gh pr create --title "Título" --body "Descrição" < /dev/null 2>&1
gh pr create --title "Título" --body "Descrição" --base main --head feature-branch < /dev/null 2>&1
gh pr create --title "Título" --body "Descrição" --draft < /dev/null 2>&1
gh pr create --title "Título" --body "Descrição" --reviewer user1,user2 --assignee @me --label bug < /dev/null 2>&1
\`\`\`

### \`gh pr close\` — Fechar uma PR
\`\`\`bash
gh pr close <number> < /dev/null 2>&1
gh pr close <number> --comment "Motivo do fechamento" < /dev/null 2>&1
gh pr close <number> --delete-branch < /dev/null 2>&1
\`\`\`

### \`gh pr merge\` — Fazer merge de uma PR
\`\`\`bash
gh pr merge <number> --merge < /dev/null 2>&1
gh pr merge <number> --squash < /dev/null 2>&1
gh pr merge <number> --rebase < /dev/null 2>&1
gh pr merge <number> --squash --delete-branch < /dev/null 2>&1
gh pr merge <number> --auto --squash < /dev/null 2>&1
\`\`\`

### \`gh pr comment\` — Comentar em uma PR
\`\`\`bash
gh pr comment <number> --body "Meu comentário" < /dev/null 2>&1
\`\`\`

### \`gh pr review\` — Adicionar review a uma PR
\`\`\`bash
gh pr review <number> --approve < /dev/null 2>&1
gh pr review <number> --approve --body "LGTM!" < /dev/null 2>&1
gh pr review <number> --comment --body "Sugestão de melhoria" < /dev/null 2>&1
gh pr review <number> --request-changes --body "Precisa de ajustes" < /dev/null 2>&1
\`\`\`

### \`gh pr checks\` — Ver status dos checks/CI de uma PR
\`\`\`bash
gh pr checks <number> < /dev/null 2>&1
gh pr checks <number> --json name,state,conclusion,workflow,completedAt,detailsUrl < /dev/null 2>&1
gh pr checks <number> --required < /dev/null 2>&1
gh pr checks <number> --watch < /dev/null 2>&1
\`\`\`

### \`gh pr diff\` — Ver diff de uma PR
\`\`\`bash
gh pr diff <number> < /dev/null 2>&1
gh pr diff <number> --name-only < /dev/null 2>&1
\`\`\`

### \`gh pr edit\` — Editar uma PR
\`\`\`bash
gh pr edit <number> --title "Novo título" < /dev/null 2>&1
gh pr edit <number> --add-label "bug,urgent" < /dev/null 2>&1
gh pr edit <number> --add-reviewer user1,user2 < /dev/null 2>&1
gh pr edit <number> --add-assignee @me < /dev/null 2>&1
\`\`\`

### Outras operações de PR
\`\`\`bash
gh pr checkout <number> < /dev/null 2>&1
gh pr ready <number> < /dev/null 2>&1
gh pr reopen <number> < /dev/null 2>&1
gh pr lock <number> < /dev/null 2>&1
gh pr unlock <number> < /dev/null 2>&1
gh pr update-branch <number> < /dev/null 2>&1
\`\`\`

## Reviews do Copilot

Para verificar reviews do GitHub Copilot em uma PR, use:
\`\`\`bash
# Ver todos os reviews incluindo do Copilot
gh pr view <number> --json reviews --jq '.reviews[] | select(.author.login == "copilot-pull-request-reviewer" or .author.login == "github-actions[bot]" or (.author.login | test("copilot"; "i"))) | {author: .author.login, state: .state, body: .body}' < /dev/null 2>&1

# Ver TODOS os reviews de uma PR (incluindo Copilot)
gh pr view <number> --json reviews --jq '.reviews[] | {author: .author.login, state: .state, body: .body, submittedAt: .submittedAt}' < /dev/null 2>&1

# Ver comentários de review (incluindo inline comments do Copilot)
gh pr view <number> --comments < /dev/null 2>&1

# Ver detalhes completos dos reviews
gh api repos/{owner}/{repo}/pulls/<number>/reviews < /dev/null 2>&1

# Ver comentários inline dos reviews (onde o Copilot faz sugestões de código)
gh api repos/{owner}/{repo}/pulls/<number>/comments < /dev/null 2>&1
\`\`\`

## Workflows e Pipelines (CI/CD)

### \`gh run list\` — Listar execuções de workflows
\`\`\`bash
gh run list --limit 20 < /dev/null 2>&1
gh run list --branch main --limit 10 < /dev/null 2>&1
gh run list --status failure < /dev/null 2>&1
gh run list --json databaseId,displayTitle,status,conclusion,workflowName,headBranch,createdAt,url --limit 20 < /dev/null 2>&1
\`\`\`

### \`gh run view\` — Ver detalhes de uma execução
\`\`\`bash
gh run view <run-id> < /dev/null 2>&1
gh run view <run-id> --json jobs,status,conclusion,workflowName,headBranch,createdAt < /dev/null 2>&1
gh run view <run-id> --log < /dev/null 2>&1
gh run view <run-id> --log-failed < /dev/null 2>&1
\`\`\`

### \`gh run watch\` — Monitorar execução em tempo real
\`\`\`bash
gh run watch <run-id> < /dev/null 2>&1
\`\`\`

### \`gh run rerun\` — Re-executar um workflow
\`\`\`bash
gh run rerun <run-id> < /dev/null 2>&1
gh run rerun <run-id> --failed < /dev/null 2>&1
\`\`\`

### \`gh run cancel\` — Cancelar uma execução
\`\`\`bash
gh run cancel <run-id> < /dev/null 2>&1
\`\`\`

### \`gh workflow list\` — Listar workflows disponíveis
\`\`\`bash
gh workflow list < /dev/null 2>&1
\`\`\`

### \`gh workflow run\` — Disparar um workflow manualmente
\`\`\`bash
gh workflow run <workflow-name> < /dev/null 2>&1
gh workflow run <workflow-name> --ref main < /dev/null 2>&1
\`\`\`

## Issues

### \`gh issue list\` — Listar issues
\`\`\`bash
gh issue list --state open --limit 20 < /dev/null 2>&1
gh issue list --assignee @me < /dev/null 2>&1
gh issue list --label "bug" < /dev/null 2>&1
gh issue list --json number,title,state,author,labels,createdAt,url --limit 20 < /dev/null 2>&1
\`\`\`

### \`gh issue view\` — Ver detalhes de uma issue
\`\`\`bash
gh issue view <number> < /dev/null 2>&1
gh issue view <number> --json title,body,state,author,labels,assignees,comments < /dev/null 2>&1
gh issue view <number> --comments < /dev/null 2>&1
\`\`\`

### \`gh issue create\` — Criar uma issue
\`\`\`bash
gh issue create --title "Título" --body "Descrição" < /dev/null 2>&1
gh issue create --title "Título" --body "Descrição" --label "bug" --assignee @me < /dev/null 2>&1
\`\`\`

### \`gh issue close\` — Fechar uma issue
\`\`\`bash
gh issue close <number> < /dev/null 2>&1
gh issue close <number> --comment "Resolvido" < /dev/null 2>&1
\`\`\`

### \`gh issue comment\` — Comentar em uma issue
\`\`\`bash
gh issue comment <number> --body "Meu comentário" < /dev/null 2>&1
\`\`\`

### Outras operações de issues
\`\`\`bash
gh issue edit <number> --title "Novo título" < /dev/null 2>&1
gh issue edit <number> --add-label "bug" < /dev/null 2>&1
gh issue reopen <number> < /dev/null 2>&1
gh issue delete <number> --yes < /dev/null 2>&1
gh issue lock <number> < /dev/null 2>&1
gh issue unlock <number> < /dev/null 2>&1
\`\`\`

## Repositório

\`\`\`bash
gh repo view < /dev/null 2>&1
gh repo view <owner/repo> < /dev/null 2>&1
gh repo view --json name,description,url,defaultBranchRef,stargazerCount,forkCount,isPrivate < /dev/null 2>&1
gh repo list <owner> --limit 20 < /dev/null 2>&1
\`\`\`

## Busca (Search)

\`\`\`bash
gh search prs "query" --repo <owner/repo> < /dev/null 2>&1
gh search issues "query" --repo <owner/repo> < /dev/null 2>&1
gh search repos "query" < /dev/null 2>&1
gh search code "query" --repo <owner/repo> < /dev/null 2>&1
gh search commits "query" --repo <owner/repo> < /dev/null 2>&1
\`\`\`

## API direta (para operações avançadas)

\`\`\`bash
gh api repos/{owner}/{repo}/pulls/<number>/reviews < /dev/null 2>&1
gh api repos/{owner}/{repo}/pulls/<number>/comments < /dev/null 2>&1
gh api repos/{owner}/{repo}/actions/runs --jq '.workflow_runs[:10]' < /dev/null 2>&1
\`\`\`

## Status geral

\`\`\`bash
gh status < /dev/null 2>&1
\`\`\`

## Conteúdo de arquivos (para inspeção de código)

\`\`\`bash
# Buscar repositório por nome
gh search repos {nome} --owner PicPay < /dev/null 2>&1

# Obter conteúdo de um arquivo (base64 decode)
gh api repos/PicPay/{repo}/contents/{path} --jq '.content' < /dev/null 2>&1 | base64 -d

# Listar arquivos de um diretório
gh api repos/PicPay/{repo}/contents/{dir_path} --jq '.[].name' < /dev/null 2>&1

# Buscar código em repositório
gh search code "query" --repo PicPay/{repo} < /dev/null 2>&1
\`\`\`

# Estratégia de Consulta

Para análise completa de uma PR:
1. Busque **informações da PR** via \`gh pr view --json\`
2. Busque **status dos checks/CI** via \`gh pr checks --json\`
3. Busque **reviews** (incluindo Copilot) via \`gh pr view --json reviews\`
4. Se necessário, busque **comentários inline** via \`gh api\`
5. Apresente um resumo consolidado

Para verificar pipelines de uma PR:
1. Use \`gh pr checks <number>\` para ver os checks da PR
2. Use \`gh run list --branch <branch>\` para ver runs associados
3. Use \`gh run view <id> --log-failed\` para ver logs de falhas

# Formatação da Resposta

- Organize informações de forma clara e objetiva
- Inclua links para a PR/issue/run quando disponíveis
- Para checks/pipelines, mostre status com ícones: ✅ (sucesso), ❌ (falha), ⏳ (em progresso), ⏭️ (skipped)
- Para reviews, indique o tipo: APPROVED, CHANGES_REQUESTED, COMMENTED, PENDING
- Inclua números de PR/issue nos resultados

# Recuperação de Erros

- Se o \`gh\` CLI não estiver instalado, oriente a instalação: \`brew install gh\` (macOS) ou consultar https://cli.github.com/
- Se não autenticado, oriente: \`gh auth login\`
- Se o repositório não for detectado, oriente: \`gh repo set-default <owner/repo>\`
- Se um comando falhar, tente uma abordagem alternativa ou reporte o erro claramente`,

  instructionsPrompt: `Instruções:

## Quando os dados já foram pré-carregados

Se você receber uma mensagem contendo "=== PR INFO ===" ou "=== PR CHECKS ===" ou "=== PR REVIEWS ===", os dados já foram coletados automaticamente via \`gh\` CLI. Neste caso:

1. Analise os dados coletados
2. Apresente um resumo organizado conforme solicitado pelo usuário
3. Execute comandos adicionais apenas se precisar de dados complementares

## Quando os dados NÃO foram pré-carregados

Para consultas sem número de PR detectado (perguntas livres, consultas gerais, etc.), siga os passos abaixo:

### Passo 1: Verificar o gh CLI

Antes de qualquer consulta, verifique se o \`gh\` está instalado e autenticado:
\`\`\`bash
command -v gh && gh auth status 2>&1
\`\`\`

- Se disponível e autenticado, prossiga com a consulta
- Se não instalado, oriente: \`brew install gh\` (macOS)
- Se não autenticado, oriente: \`gh auth login\`

### Passo 2: Identificar o repositório

O \`gh\` CLI detecta automaticamente o repositório pelo diretório atual. Se falhar:
\`\`\`bash
gh repo set-default <owner/repo>
\`\`\`

### Passo 3: Executar a consulta

Use os comandos do \`gh\` CLI conforme documentado no system prompt.

**Timeout:** Use \`timeout_seconds: 30\` para a maioria dos comandos, \`timeout_seconds: 60\` para operações que envolvem logs de workflow ou diffs grandes.

## Fluxo de implementação de bug fix

Para implementar correção de bug identificada em ticket Jira:
1. Extrair nome do serviço e classe afetada da descrição do ticket
2. Buscar repositório no GitHub: \`gh search repos {nome} --owner PicPay\`
3. Obter código-fonte dos arquivos relevantes: \`gh api repos/PicPay/{repo}/contents/{path} --jq '.content' | base64 -d\`
4. Propor alterações com base no código lido

## Operações destrutivas

⚠️ Para operações destrutivas ou irreversíveis (\`merge\`, \`close\`, \`delete\`), confirme com o usuário antes de executar, a menos que ele tenha explicitamente solicitado.

## Reviews do Copilot

Quando o usuário perguntar sobre reviews do Copilot em uma PR:
1. Primeiro busque todos os reviews: \`gh pr view <number> --json reviews\`
2. Filtre por reviews do Copilot (login contendo "copilot")
3. Se necessário, busque comentários inline: \`gh api repos/{owner}/{repo}/pulls/<number>/comments\`
4. Apresente os achados do Copilot de forma organizada

## Formatação

- Use ícones para status: ✅ ❌ ⏳ ⏭️
- Inclua links quando disponíveis
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

    function extractPrNumber(text: string): string | null {
      const urlMatch = text.match(
        /https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/,
      )
      if (urlMatch) return urlMatch[1]

      const prMatch = text.match(/\b(?:PR|pr|pull request|pull)\s*#?(\d+)\b/)
      if (prMatch) return prMatch[1]

      const hashMatch = text.match(/#(\d+)\b/)
      if (hashMatch) return hashMatch[1]

      return null
    }

    function extractRepoFromUrl(text: string): string | null {
      const match = text.match(
        /https?:\/\/github\.com\/([^/]+\/[^/]+)/,
      )
      if (match) return match[1]
      return null
    }

    logger.info('Checking gh CLI availability...')

    const { toolResult: authResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'command -v gh >/dev/null 2>&1 && echo "GH_INSTALLED" && gh auth status 2>&1 || echo "GH_NOT_INSTALLED" < /dev/null',
        timeout_seconds: 10,
      },
    }

    const authOutput = extractStdout(authResult)

    if (authOutput.includes('GH_NOT_INSTALLED')) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '❌ O GitHub CLI (`gh`) não está instalado.\n\n' +
            'Instale com:\n' +
            '- **macOS:** `brew install gh`\n' +
            '- **Linux:** consulte https://cli.github.com/\n' +
            '- **Windows:** `winget install GitHub.cli`\n\n' +
            'Depois autentique: `gh auth login`',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    const isAuthenticated =
      authOutput.includes('Logged in') ||
      authOutput.includes('Token:') ||
      authOutput.includes('✓')

    if (!isAuthenticated) {
      logger.info('gh CLI not authenticated, attempting auto-login...')

      const { toolResult: tokenCheckResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command:
            'if [ -n "$GH_TOKEN" ]; then echo "HAS_GH_TOKEN"; ' +
            'elif [ -n "$GITHUB_TOKEN" ]; then echo "HAS_GITHUB_TOKEN"; ' +
            'else echo "NO_TOKEN"; fi',
          timeout_seconds: 5,
        },
      }

      const tokenCheckOutput = extractStdout(tokenCheckResult)

      if (tokenCheckOutput.includes('NO_TOKEN')) {
        logger.info('No token env var found, trying gh auth login with web flow...')

        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              '🔐 GitHub CLI não autenticado. Tentando autenticação via browser...\n' +
              '⚠️ Isso pode abrir uma janela no navegador para autenticação OAuth.',
          },
          includeToolCall: false,
        }

        const { toolResult: loginResult } = yield {
          toolName: 'run_terminal_command',
          input: {
            command:
              'gh auth login --hostname github.com --git-protocol https --web < /dev/null 2>&1',
            timeout_seconds: 60,
          },
        }

        const loginOutput = extractStdout(loginResult)
        logger.info('Login attempt output: ' + loginOutput.slice(0, 300))

        const { toolResult: reAuthResult } = yield {
          toolName: 'run_terminal_command',
          input: {
            command: 'gh auth status 2>&1',
            timeout_seconds: 10,
          },
        }

        const reAuthOutput = extractStdout(reAuthResult)

        if (
          !reAuthOutput.includes('Logged in') &&
          !reAuthOutput.includes('Token:') &&
          !reAuthOutput.includes('✓')
        ) {
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                '⚠️ O GitHub CLI (`gh`) está instalado mas não autenticado.\n\n' +
                'A autenticação automática não foi possível. Autentique manualmente:\n\n' +
                '**Opção 1 — Login interativo (abre o browser):**\n' +
                '```bash\ngh auth login\n```\n\n' +
                '**Opção 2 — Via token de ambiente:**\n' +
                '```bash\nexport GH_TOKEN="ghp_seu_token_aqui"\n```\n\n' +
                'Output do auth status:\n```\n' +
                reAuthOutput.slice(0, 500) +
                '\n```',
            },
            includeToolCall: false,
          }
          yield 'STEP_ALL'
          return
        }

        logger.info('gh CLI authenticated after web login ✅')
      } else {
        const tokenVar = tokenCheckOutput.includes('HAS_GH_TOKEN')
          ? 'GH_TOKEN'
          : 'GITHUB_TOKEN'

        logger.info('Found ' + tokenVar + ' env var, authenticating...')

        const { toolResult: loginResult } = yield {
          toolName: 'run_terminal_command',
          input: {
            command:
              'echo "$' + tokenVar + '" | gh auth login --with-token 2>&1',
            timeout_seconds: 15,
          },
        }

        const loginOutput = extractStdout(loginResult)
        logger.info('Token login output: ' + loginOutput.slice(0, 300))

        const { toolResult: reAuthResult } = yield {
          toolName: 'run_terminal_command',
          input: {
            command: 'gh auth status 2>&1',
            timeout_seconds: 10,
          },
        }

        const reAuthOutput = extractStdout(reAuthResult)

        if (
          !reAuthOutput.includes('Logged in') &&
          !reAuthOutput.includes('Token:') &&
          !reAuthOutput.includes('✓')
        ) {
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                '⚠️ O GitHub CLI (`gh`) está instalado mas a autenticação via `' +
                tokenVar +
                '` falhou.\n\n' +
                'Verifique se o token é válido e tente manualmente:\n' +
                '```bash\ngh auth login\n```\n\n' +
                'Output:\n```\n' +
                reAuthOutput.slice(0, 500) +
                '\n```',
            },
            includeToolCall: false,
          }
          yield 'STEP_ALL'
          return
        }

        logger.info('gh CLI authenticated via ' + tokenVar + ' ✅')
      }
    } else {
      logger.info('gh CLI already authenticated ✅')
    }


    const prNumber = extractPrNumber(prompt || '')
    const repoFromUrl = extractRepoFromUrl(prompt || '')

    if (!prNumber) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '=== GH CLI READY ===\n\n' +
            'O GitHub CLI está instalado e autenticado. ' +
            'Nenhum número de PR detectado no prompt — prossiga com a consulta do usuário usando os comandos `gh` adequados.',
        },
        includeToolCall: false,
      }
      yield 'STEP_ALL'
      return
    }

    logger.info('PR #' + prNumber + ' detected, pre-fetching data...')

    const repoFlag = repoFromUrl ? ' -R ' + repoFromUrl : ''

    const prInfoCmd =
      'gh pr view ' +
      prNumber +
      repoFlag +
      ' --json number,title,state,author,body,labels,assignees,reviewRequests,additions,deletions,changedFiles,commits,mergeable,headRefName,baseRefName,url,createdAt,updatedAt' +
      ' < /dev/null 2>&1'

    const { toolResult: prInfoResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: prInfoCmd, timeout_seconds: 30 },
    }

    const prInfoOutput = extractStdout(prInfoResult)

    const prChecksCmd =
      'gh pr checks ' +
      prNumber +
      repoFlag +
      ' --json name,state,conclusion,workflow,completedAt,detailsUrl' +
      ' < /dev/null 2>&1'

    const { toolResult: prChecksResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: prChecksCmd, timeout_seconds: 30 },
    }

    const prChecksOutput = extractStdout(prChecksResult)

    const prReviewsCmd =
      'gh pr view ' +
      prNumber +
      repoFlag +
      ' --json reviews --jq \'.reviews[] | {author: .author.login, state: .state, body: .body, submittedAt: .submittedAt}\'' +
      ' < /dev/null 2>&1'

    const { toolResult: prReviewsResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: prReviewsCmd, timeout_seconds: 30 },
    }

    const prReviewsOutput = extractStdout(prReviewsResult)

    let contextMessage = ''

    if (prInfoOutput && !prInfoOutput.includes('Could not resolve')) {
      contextMessage +=
        '=== PR INFO ===\n' +
        'Dados da PR #' +
        prNumber +
        ' coletados automaticamente via `gh pr view`:\n\n' +
        '```json\n' +
        prInfoOutput +
        '\n```\n\n'
    } else {
      contextMessage +=
        '=== PR INFO ===\n' +
        '⚠️ Não foi possível obter dados da PR #' +
        prNumber +
        ':\n```\n' +
        prInfoOutput.slice(0, 500) +
        '\n```\n\n'
    }

    if (prChecksOutput) {
      contextMessage +=
        '=== PR CHECKS ===\n' +
        'Status dos checks/CI da PR #' +
        prNumber +
        ':\n\n' +
        '```json\n' +
        prChecksOutput +
        '\n```\n\n'
    }

    if (prReviewsOutput.trim()) {
      const hasCopilotReview = prReviewsOutput.toLowerCase().includes('copilot')
      contextMessage +=
        '=== PR REVIEWS ===\n' +
        (hasCopilotReview ? '🤖 **Reviews do Copilot detectados nesta PR.**\n\n' : '') +
        'Reviews da PR #' +
        prNumber +
        ':\n\n' +
        '```\n' +
        prReviewsOutput +
        '\n```\n\n'
    } else {
      contextMessage +=
        '=== PR REVIEWS ===\n' +
        'Nenhum review encontrado na PR #' +
        prNumber +
        '.\n\n'
    }

    contextMessage +=
      'Analise os dados acima e responda ao pedido do usuário. ' +
      'Se precisar de informações adicionais (diff, logs de workflow, comentários inline, etc.), execute comandos `gh` complementares.'

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
