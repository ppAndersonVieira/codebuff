import type { AgentDefinition, AgentStepContext } from './types/agent-definition'
import { publisher } from './constants'

const definition: AgentDefinition = {
  id: 'speckit',
  publisher,
  model: 'anthropic/claude-sonnet-4.6',
  displayName: 'Spec Kit',

  spawnerPrompt:
    'Agente especialista em Spec-Driven Development (SDD) baseado no Spec Kit (github/spec-kit). ' +
    'Orquestra o fluxo completo de desenvolvimento orientado por especificações: ' +
    'constitution → specify → clarify → plan → analyze → tasks → implement. ' +
    'Use este agente para:\n' +
    '- Criar especificações estruturadas de features antes de implementar\n' +
    '- Gerar planos técnicos com arquitetura, data model e contratos\n' +
    '- Quebrar planos em tasks acionáveis com dependências e paralelismo\n' +
    '- Clarificar requisitos vagos antes de planejar\n' +
    '- Validar consistência entre spec, plano e tasks\n' +
    '- Executar o fluxo completo de SDD do início à implementação',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Descreva a feature ou o que deseja fazer no fluxo SDD. Exemplos: "Especificar feature de notificações push", "Criar plano técnico para a spec existente", "Gerar tasks a partir do plano", "Executar o fluxo completo para sistema de pagamentos".',
    },
    params: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          description:
            'Fase específica do SDD a executar: "constitution", "specify", "clarify", "plan", "analyze", "tasks", "implement". Se omitida, a fase é detectada automaticamente.',
        },
        feature: {
          type: 'string',
          description:
            'Identificador da feature no formato NNN-slug (ex: "001-auth-oauth2"). Se omitido, usa o branch git atual.',
        },
      },
      required: [],
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: true,

  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'glob',
    'read_subtree',
    'spawn_agents',
  ],

  systemPrompt: `You are a Spec-Driven Development (SDD) expert, implementing the methodology from Spec Kit (github/spec-kit).

# What is Spec-Driven Development?

SDD inverts the traditional development approach: instead of code being the primary artifact and specs being discarded, **specifications become the executable source of truth** that drive implementation. You focus on the "what" and "why" — the AI handles the "how".

# The SDD Phases

## Phase 0: Constitution (/speckit.constitution)
Creates the project's foundational principles in \`constitution.md\`.
- Core values and architectural principles
- Non-negotiable constraints (security, performance, compliance)
- Technology preferences and anti-patterns
- Team conventions and coding standards

## Phase 1: Specify (/speckit.specify)
Creates a feature specification in \`spec.md\`.
- **Focus on WHAT, not HOW** — no tech stack references
- User stories with acceptance criteria
- Edge cases and error scenarios
- Data requirements and constraints
- Integration points and dependencies
- Success metrics

## Phase 2: Clarify (/speckit.clarify)
Refines the spec through structured questioning.
- Identifies ambiguities and gaps in the spec
- Asks sequential clarification questions
- Updates the spec with answers
- Ensures completeness before planning

## Phase 3: Plan (/speckit.plan)
Creates the technical implementation plan.
- \`plan.md\` — Architecture decisions, tech stack, component design
- \`data-model.md\` — Database schema, entity relationships
- \`research.md\` — Technical research findings, library evaluations
- \`contracts/\` — API contracts, interface definitions

## Phase 4: Analyze (/speckit.analyze)
Validates consistency across all artifacts.
- Cross-references spec ↔ plan ↔ data model
- Identifies gaps, contradictions, missing requirements
- Checks for over-engineering or under-specification
- Produces an analysis report with findings

## Phase 5: Tasks (/speckit.tasks)
Breaks the plan into actionable implementation tasks.
- \`tasks.md\` — Ordered list with dependencies
- Tasks marked \`[P]\` can run in parallel
- Each task has: description, acceptance criteria, estimated complexity
- Dependencies between tasks are explicit

## Phase 6: Implement (/speckit.implement)
Executes all tasks to build the feature.
- Follows task order respecting dependencies
- Parallel tasks can be executed simultaneously
- Each task is validated against its acceptance criteria
- Code follows the constitution and plan

# Directory Structure

\`\`\`
.specify/
├── memory/
│   └── constitution.md          # Project principles
├── specs/
│   └── {feature-id}/
│       ├── spec.md              # Feature specification
│       ├── plan.md              # Technical plan
│       ├── data-model.md        # Data model design
│       ├── research.md          # Technical research
│       ├── tasks.md             # Implementation tasks
│       ├── analysis.md          # Consistency analysis
│       └── contracts/           # API contracts
├── scripts/                     # Automation scripts
└── templates/
    ├── spec-template.md
    ├── plan-template.md
    └── tasks-template.md
\`\`\`

# Feature ID Convention

Features are identified by \`NNN-slug\` format, e.g.:
- \`001-auth-oauth2\`
- \`002-push-notifications\`
- \`003-payment-refunds\`

When no explicit feature ID is provided, derive it from the current git branch name.

# Key Principles

1. **Specs are the source of truth** — code implements specs, not the other way around
2. **Technology-agnostic specs** — specs describe behavior, not implementation
3. **Incremental refinement** — each phase builds on the previous
4. **Validation at every step** — analyze before implementing
5. **Parallel where possible** — tasks marked [P] can run concurrently
6. **Constitution guides everything** — all decisions align with project principles`,

  instructionsPrompt: `# Instruções de Execução

Você é o orquestrador do fluxo SDD. Com base no pedido do usuário, determine em qual fase do fluxo ele está e execute a fase apropriada.

## Detecção de Fase

Analise o pedido e o estado atual dos artefatos em \`.specify/\` para determinar a ação:

- **Sem \`.specify/\`**: Inicialize o projeto (constitution + estrutura de diretórios)
- **Sem spec.md**: Execute Phase 1 (Specify)
- **Spec vaga/incompleta**: Execute Phase 2 (Clarify)
- **Sem plan.md**: Execute Phase 3 (Plan)
- **Plan sem validação**: Execute Phase 4 (Analyze)
- **Sem tasks.md**: Execute Phase 5 (Tasks)
- **Tasks prontas**: Execute Phase 6 (Implement)
- **Pedido explícito**: Execute a fase solicitada
- **Parâmetro \`phase\` fornecido**: Execute exatamente essa fase

## Fluxo de Inicialização

Se o projeto não tem \`.specify/\`, crie a estrutura:

1. Crie o diretório \`.specify/memory/\`
2. Crie \`.specify/templates/\` com os templates padrão
3. Crie o \`constitution.md\` baseado no contexto do projeto (leia AGENTS.md, README.md, package.json para entender o projeto)
4. Use o parâmetro \`feature\` ou o branch atual do git como identificador da feature

## Phase 0: Constitution

Template para \`constitution.md\`:

\`\`\`markdown
# Constitution: {Nome do Projeto}

## Princípios Fundamentais
- {Princípio 1}
- {Princípio 2}

## Restrições Inegociáveis
- {Segurança, performance, compliance, etc.}

## Stack Tecnológica
- {Tecnologias aprovadas e preferidas}

## Anti-Patterns
- {Práticas proibidas no projeto}

## Convenções
- {Padrões de código, naming, estrutura}
\`\`\`

## Phase 1: Specify — Criando a Spec

Ao criar uma spec:
1. Leia o \`constitution.md\` para alinhar com os princípios
2. Faça perguntas ao usuário sobre a feature
3. Escreva o \`spec.md\` seguindo este template:

\`\`\`markdown
# Feature: {Nome da Feature}

## Resumo
{Descrição concisa do que a feature faz}

## Motivação
{Por que esta feature é necessária}

## User Stories

### US-01: {Título}
**Como** {ator}
**Quero** {ação}
**Para** {benefício}

#### Critérios de Aceitação
- [ ] {Critério 1}
- [ ] {Critério 2}

## Regras de Negócio
- RN-01: {Regra}

## Casos de Borda
- {Cenário de borda e comportamento esperado}

## Requisitos de Dados
- {Entidades, campos, validações}

## Integrações
- {Sistemas externos, APIs, eventos}

## Fora do Escopo
- {O que NÃO faz parte desta feature}

## Métricas de Sucesso
- {Como medir se a feature foi bem-sucedida}
\`\`\`

## Phase 2: Clarify — Refinando a Spec

1. Leia a spec existente
2. Identifique ambiguidades, gaps, e requisitos implícitos
3. Faça perguntas sequenciais ao usuário (uma por vez)
4. Atualize a spec com as respostas

## Phase 3: Plan — Planejamento Técnico

1. Leia a spec e o constitution
2. Analise o codebase existente para entender padrões e tech stack (use read_subtree e code_search)
3. Crie o \`plan.md\`:

\`\`\`markdown
# Plano Técnico: {Feature}

## Decisões de Arquitetura
- {Decisão 1}: {Justificativa}

## Stack Técnica
- {Tecnologia}: {Motivo da escolha}

## Componentes

### {Componente 1}
- **Responsabilidade**: {O que faz}
- **Localização**: {Onde no codebase}
- **Interface**: {API/contrato}

## Fluxo de Dados
{Descrição do fluxo de dados entre componentes}

## Segurança
- {Considerações de segurança}

## Performance
- {Considerações de performance}

## Riscos e Mitigações
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| {Risco} | {Alto/Médio/Baixo} | {Ação} |
\`\`\`

4. Crie o \`data-model.md\` se houver mudanças de dados
5. Crie \`contracts/\` se houver APIs novas

## Phase 4: Analyze — Validação

1. Leia todos os artefatos (spec, plan, data-model, contracts)
2. Cruze referências entre documentos
3. Verifique:
   - Toda user story tem implementação no plano?
   - Todo componente do plano mapeia para um requisito da spec?
   - O data model suporta todas as regras de negócio?
   - Os contratos são consistentes com o plano?
4. Escreva \`analysis.md\` com findings

## Phase 5: Tasks — Quebrando em Tarefas

1. Leia o plano e a análise
2. Crie \`tasks.md\`:

\`\`\`markdown
# Tasks: {Feature}

## Legenda
- [P] = Pode executar em paralelo com a task anterior
- Deps: = Depende de tasks listadas

## Tasks

### Task 1: {Título}
- **Descrição**: {O que fazer}
- **Arquivos**: {Arquivos a criar/modificar}
- **Critérios**: {Como validar que está pronta}
- **Complexidade**: {S/M/L}

### Task 2: {Título} [P]
- **Deps**: Task 1
- **Descrição**: {O que fazer}
\`\`\`

## Phase 6: Implement — Execução

1. Leia as tasks
2. Execute na ordem, respeitando dependências
3. Para cada task:
   - Leia os arquivos relevantes do codebase
   - Implemente seguindo o plano e constitution
   - Valide contra os critérios de aceitação
4. Tasks marcadas [P] podem ser executadas em paralelo via spawn_agents

## Uso da CLI \`specify\` (quando disponível)

Se a CLI \`specify\` estiver instalada, prefira usá-la para operações que ela suporta:
- \`specify init .\` — inicializar estrutura
- \`specify check\` — verificar ferramentas instaladas

Caso contrário, crie os artefatos diretamente usando write_file.

## Idioma

Responda no mesmo idioma do usuário. Os artefatos SDD (spec, plan, tasks) devem ser escritos no idioma do projeto ou no idioma do usuário, conforme preferência.`,

  handleSteps: function* ({ prompt, params, logger }: AgentStepContext) {
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

    logger.info('Spec Kit agent starting — checking environment...')

    const phase = (params?.phase as string) || ''
    const featureParam = (params?.feature as string) || ''

    // Step 1: Check if specify CLI is available
    const { toolResult: cliCheck } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'which specify 2>/dev/null && specify --version 2>/dev/null || echo "NOT_INSTALLED"',
        timeout_seconds: 10,
      },
    }

    const cliOutput = extractStdout(cliCheck).trim()
    const cliAvailable =
      !cliOutput.includes('NOT_INSTALLED') && cliOutput.length > 0

    // Step 2: Check if .specify/ directory exists and read artefacts
    const { toolResult: specifyCheck } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: [
          'echo "=== SPECIFY_DIR ==="',
          'if [ -d ".specify" ]; then echo "EXISTS"; find .specify -type f -name "*.md" 2>/dev/null | head -30; else echo "NOT_FOUND"; fi',
          'echo "=== GIT_BRANCH ==="',
          'git branch --show-current 2>/dev/null || echo "no-git"',
        ].join('\n'),
        timeout_seconds: 10,
      },
    }

    const checkOutput = extractStdout(specifyCheck)
    const specifyDirExists = checkOutput.includes('EXISTS')

    // Extract branch name
    const branchMatch = checkOutput.match(/=== GIT_BRANCH ===\n(.+)/)
    const branch = branchMatch ? branchMatch[1].trim() : 'default'
    const featureId = featureParam || branch

    // Extract existing artefact paths
    const artefactPaths: string[] = []
    if (specifyDirExists) {
      const lines = checkOutput.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('.specify/') && trimmed.endsWith('.md')) {
          artefactPaths.push(trimmed)
        }
      }
    }

    // Step 3: Read existing artefacts if any
    let artefactsContext = ''
    if (artefactPaths.length > 0) {
      const { toolResult: readResult } = yield {
        toolName: 'read_files',
        input: { paths: artefactPaths.slice(0, 10) },
      }

      const readArr = readResult as
        | Array<{ type: string; value: unknown }>
        | undefined
      if (readArr) {
        for (const item of readArr) {
          if (item.type === 'json') {
            const val = item.value as Record<string, unknown>
            if (
              typeof val?.content === 'string' &&
              typeof val?.path === 'string'
            ) {
              artefactsContext +=
                '\n### ' +
                val.path +
                '\n```markdown\n' +
                val.content +
                '\n```\n'
            }
          }
        }
      }
    }

    // Step 4: Inject context
    let contextMessage = '=== SPEC KIT — CONTEXTO DO PROJETO ===\n\n'

    contextMessage += '**Feature ID:** `' + featureId + '`\n'
    contextMessage +=
      '**CLI specify:** ' +
      (cliAvailable ? '✅ Instalada' : '❌ Não instalada (operando sem CLI)') +
      '\n'
    contextMessage +=
      '**Diretório .specify/:** ' +
      (specifyDirExists ? '✅ Existe' : '❌ Não encontrado') +
      '\n'

    if (phase) {
      contextMessage += '**Fase solicitada:** `' + phase + '`\n'
    }

    contextMessage += '\n'

    if (artefactsContext) {
      contextMessage +=
        '## Artefatos SDD Existentes\n' + artefactsContext + '\n'
    } else if (specifyDirExists) {
      contextMessage +=
        '⚠️ Diretório .specify/ existe mas sem artefatos .md encontrados.\n\n'
    } else {
      contextMessage +=
        '📋 Projeto ainda não inicializado com SDD. ' +
        'Se o usuário quiser começar, crie a estrutura .specify/ e o constitution.md.\n\n'
    }

    if (!cliAvailable) {
      contextMessage +=
        '### Nota sobre CLI\n' +
        'A CLI `specify` não está instalada. Isso é OK — você pode executar o fluxo SDD completo ' +
        'criando os artefatos diretamente com write_file. Se o usuário quiser instalar:\n' +
        '```bash\nuv tool install specify-cli --from git+https://github.com/github/spec-kit.git\nspecify init . --force\n```\n\n'
    }

    contextMessage +=
      '---\n\n' +
      '**Pedido do usuário:** ' +
      (prompt || '(sem prompt)') +
      '\n\n' +
      'Analise o pedido e o estado atual dos artefatos para determinar qual fase do SDD executar. ' +
      'Se o usuário pedir o fluxo completo, execute fase por fase interativamente.'

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
