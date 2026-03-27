import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

// =========================================================================
// Exported types & helpers (for testing)
// NOTE: Identical copies of these functions exist inside handleSteps because
// the generator is serialized to a string and executed in a QuickJS sandbox
// where module-scope references are unavailable.
// =========================================================================

export interface Learning {
  id: string
  timestamp: string
  agentId: string
  category: string
  trigger: string
  learning: string
  confidence: number
  usageCount: number
  lastUsed: string
  source: string
  absorbed?: boolean
  absorbedAt?: string
}

export interface LearningFile {
  agentId: string
  learnings: Learning[]
}

export function extractStdout(toolResult: unknown): string {
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

export function getLastAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; content?: unknown }
    if (msg.role !== 'assistant') continue

    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      const texts: string[] = []
      for (const part of msg.content) {
        const p = part as { type?: string; text?: string }
        if (p.type === 'text' && typeof p.text === 'string') {
          texts.push(p.text)
        }
      }
      return texts.join('\n')
    }
  }
  return ''
}

export function extractJsonArray(text: string): unknown[] {
  const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as unknown[]
    } catch { /* ignore */ }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as unknown[]
    } catch { /* ignore */ }
  }

  return []
}

export function toBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 128) {
      bytes.push(code)
    } else if (code < 2048) {
      bytes.push(192 | (code >> 6), 128 | (code & 63))
    } else {
      bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63))
    }
  }
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    result += chars[b0 >> 2]
    result += chars[((b0 & 3) << 4) | (b1 >> 4)]
    result += (i + 1 < bytes.length) ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '='
    result += (i + 2 < bytes.length) ? chars[b2 & 63] : '='
  }
  return result
}

export function applyConfidenceDecay(
  learnings: Learning[],
  decayDays: number,
  minUsage: number,
): Learning[] {
  const now = Date.now()
  const decayMs = decayDays * 24 * 60 * 60 * 1000
  return learnings.map((l) => {
    const age = now - new Date(l.timestamp).getTime()
    if (age > decayMs && l.usageCount < minUsage) {
      return { ...l, confidence: Math.max(0.1, l.confidence * 0.5) }
    }
    return l
  })
}

export function isDuplicate(
  existing: Learning[],
  candidate: { trigger?: string; category?: string; learning?: string },
): boolean {
  const candidateKey = ((candidate.category || '') + ':' + (candidate.trigger || '') + ':' + (candidate.learning || '')).slice(0, 150).toLowerCase()
  return existing.some((l) => {
    const existingKey = (l.category + ':' + l.trigger + ':' + l.learning).slice(0, 150).toLowerCase()
    return existingKey === candidateKey
  })
}

export function relevanceScore(l: Learning): number {
  return l.confidence * (Math.log(l.usageCount + 2) / Math.log(2))
}

export function mergeLearningsWithCap(
  existing: Learning[],
  newLearnings: Learning[],
  maxPerAgent: number,
): Learning[] {
  let merged = [...existing, ...newLearnings]
  if (merged.length > maxPerAgent) {
    merged.sort((a, b) => relevanceScore(b) - relevanceScore(a))
    merged = merged.slice(0, maxPerAgent)
  }
  return merged
}

export function buildPersistCommand(jsonStr: string, filePath: string, learningsDir: string): string {
  const b64 = toBase64(jsonStr)
  return 'mkdir -p ' + learningsDir + " && echo '" + b64 + "' | base64 -d > " + filePath + '.tmp.$$ && mv ' + filePath + '.tmp.$$ ' + filePath
}

export function buildReadCommand(learningsDir: string): string {
  return (
    'mkdir -p ' + learningsDir + ' && ' +
    'for f in ' + learningsDir + '/*.json; do ' +
    '  [ -f "$f" ] && cat "$f" && echo "___FILE_SEP___"; ' +
    'done 2>/dev/null || echo "NO_LEARNINGS"'
  )
}

export function parseLearningsOutput(stdout: string): LearningFile[] {
  if (stdout.includes('NO_LEARNINGS') || !stdout.trim()) {
    return []
  }
  const files: LearningFile[] = []
  const fileParts = stdout.split('___FILE_SEP___').filter((p) => p.trim())
  for (const part of fileParts) {
    try {
      const parsed = JSON.parse(part.trim()) as LearningFile
      if (parsed.agentId && Array.isArray(parsed.learnings)) {
        files.push(parsed)
      }
    } catch {
      // Skip malformed files
    }
  }
  return files
}

export function filterAbsorbedLearnings(learnings: Learning[]): Learning[] {
  return learnings.filter((l) => !l.absorbed)
}

const definition: AgentDefinition = {
  id: 'agent-monitor',
  publisher,
  model: 'anthropic/claude-sonnet-4.6',
  displayName: 'Agent Monitor',

  spawnerPrompt:
    'Coordenador inteligente que monitora e melhora interações com agents de infraestrutura (Dynatrace, GitHub, Atlassian, Slack, SonarQube, Hoop, pAI). ' +
    'Acumula learnings de interações passadas para melhorar respostas futuras. ' +
    'Modo "monitor" (padrão): executa pedidos via subagents com contexto aprendido. ' +
    'Modo "review": analisa learnings acumulados e sugere melhorias nos prompts dos agents.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'O que você quer fazer. No modo monitor: seu pedido será executado via subagents com contexto aprendido. No modo review: análise dos learnings acumulados.',
    },
    params: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description:
            'Modo de operação: "monitor" (padrão) executa pedidos com aprendizado, "review" analisa learnings e sugere melhorias nos agents.',
        },
      },
      required: [],
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: true,

  toolNames: [
    'run_terminal_command',
    'add_message',
    'spawn_agents',
    'read_files',
  ],

  spawnableAgents: [
    'dynatrace-agent',
    'atlassian',
    'github-agent',
    'slack-agent',
    'sonar-agent',
    'hoop-agent',
    'pai-agent',
    'pai-researcher',
  ],

  systemPrompt: `Você é o Agent Monitor — um coordenador inteligente que melhora continuamente a qualidade das interações com agents de infraestrutura (Dynatrace, GitHub, Atlassian, Slack, SonarQube, Hoop, pAI).

Você opera em dois modos:

## Modo Monitor (padrão)
- Recebe o pedido do usuário junto com learnings de interações passadas
- Usa os learnings para enriquecer e melhorar a qualidade da interação
- Delega a execução ao subagent mais adequado via spawn_agents
- Ao final, extrai novos learnings da interação

## Modo Review
- Analisa todos os learnings acumulados ao longo das interações
- Lê o código-fonte dos agents monitorados
- Produz um relatório detalhado com sugestões de melhoria nos prompts e comportamentos dos agents

## Agents Monitorados
- **dynatrace-agent** — observabilidade, logs, métricas, traces
- **atlassian** — Jira issues, Confluence pages
- **github-agent** — PRs, issues, workflows, reviews
- **slack-agent** — mensagens, canais, busca
- **sonar-agent** — qualidade de código, issues, vulnerabilidades
- **hoop-agent** — acesso a infraestrutura, databases, runbooks
- **pai-agent** — serviços internos PicPay, documentação
- **pai-researcher** — pesquisa coordenada em múltiplos sistemas

## Categorias de Learnings
- **error_recovery** — padrões de erro e como resolvê-los
- **optimization** — formas mais eficientes de executar tarefas
- **user_preference** — preferências do usuário (idioma, formato, nível de detalhe)
- **best_practice** — práticas que levaram a bons resultados
- **common_query** — queries/comandos frequentes reutilizáveis
- **anti_pattern** — abordagens que não funcionam e devem ser evitadas`,

  instructionsPrompt: `Instruções para execução:

## Modo Monitor

Você recebeu learnings de interações passadas como contexto. Sua ÚNICA tarefa é:
1. Identificar qual subagent é o mais adequado para o pedido do usuário
2. Chamar spawn_agents UMA VEZ com o subagent escolhido, incluindo os learnings relevantes no prompt
3. NÃO faça mais nada — não tente responder você mesmo, não faça múltiplas chamadas de ferramentas

Ao construir o prompt para o subagent, use os learnings para:
- **Evitar erros conhecidos** — se um learning indica que certo padrão causa erro, inclua essa informação
- **Aplicar otimizações** — inclua queries/comandos otimizados aprendidos anteriormente
- **Respeitar preferências** — informe o formato e nível de detalhe preferido pelo usuário
- **Reutilizar padrões de sucesso** — inclua best practices de interações passadas

IMPORTANTE: Você é apenas um coordenador. Delegue o trabalho ao subagent e pare. A resposta do subagent será retornada automaticamente ao agent principal.

## Modo Review

Analise os learnings acumulados em conjunto com o código-fonte dos agents e produza:
1. **Resumo dos learnings** — estatísticas por agent e categoria
2. **Sugestões de melhoria nos prompts** — alterações específicas nos systemPrompt/instructionsPrompt dos agents
3. **Novos padrões identificados** — comportamentos recorrentes que justificam mudanças no código
4. **Learnings obsoletos** — learnings com baixa confiança ou desatualizados para remoção
5. **Melhorias de UX** — sugestões para melhorar a experiência do usuário baseado nos padrões observados

Seja específico nas sugestões — inclua trechos de prompt que devem ser adicionados/alterados.`,

  handleSteps: function* ({ prompt, params, logger }: AgentStepContext) {
    // =========================================================================
    // Constants (must be inside handleSteps — generators are serialized)
    // =========================================================================

    const LEARNINGS_DIR = '$HOME/.codebuff/agent-learnings'

    const MONITORED_AGENTS = [
      'dynatrace-agent',
      'atlassian',
      'github-agent',
      'slack-agent',
      'sonar-agent',
      'hoop-agent',
      'pai-agent',
      'pai-researcher',
    ]

    const AGENT_SOURCE_FILES = [
      'agents/dynatrace-agent.ts',
      'agents/atlassian.ts',
      'agents/github-agent.ts',
      'agents/slack-agent.ts',
      'agents/sonar-agent.ts',
      'agents/hoop-agent.ts',
      'agents/pai-agent.ts',
      'agents/pai-researcher.ts',
    ]

    const MAX_LEARNINGS_IN_CONTEXT = 15
    const MAX_LEARNINGS_PER_AGENT = 50
    const MIN_CONFIDENCE = 0.5
    const CONFIDENCE_DECAY_DAYS = 30
    const CONFIDENCE_DECAY_MIN_USAGE = 2

    // =========================================================================
    // Inlined for sandbox serialization — keep in sync with module-scope exports above
    // =========================================================================

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

    function getLastAssistantText(messages: unknown[]): string {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i] as { role?: string; content?: unknown }
        if (msg.role !== 'assistant') continue

        if (typeof msg.content === 'string') return msg.content
        if (Array.isArray(msg.content)) {
          const texts: string[] = []
          for (const part of msg.content) {
            const p = part as { type?: string; text?: string }
            if (p.type === 'text' && typeof p.text === 'string') {
              texts.push(p.text)
            }
          }
          return texts.join('\n')
        }
      }
      return ''
    }

    function extractJsonArray(text: string): unknown[] {
      const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/)
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]) as unknown[]
        } catch { /* ignore */ }
      }

      const arrayMatch = text.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]) as unknown[]
        } catch { /* ignore */ }
      }

      return []
    }

    function toBase64(str: string): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const bytes: number[] = []
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i)
        if (code < 128) {
          bytes.push(code)
        } else if (code < 2048) {
          bytes.push(192 | (code >> 6), 128 | (code & 63))
        } else {
          bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63))
        }
      }
      let result = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
        result += chars[b0 >> 2]
        result += chars[((b0 & 3) << 4) | (b1 >> 4)]
        result += (i + 1 < bytes.length) ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '='
        result += (i + 2 < bytes.length) ? chars[b2 & 63] : '='
      }
      return result
    }

    function buildPersistCommand(jsonStr: string, filePath: string, learningsDir: string): string {
      const b64 = toBase64(jsonStr)
      return 'mkdir -p ' + learningsDir + " && echo '" + b64 + "' | base64 -d > " + filePath + '.tmp.$$ && mv ' + filePath + '.tmp.$$ ' + filePath
    }

    function buildReadCommand(learningsDir: string): string {
      return (
        'mkdir -p ' + learningsDir + ' && ' +
        'for f in ' + learningsDir + '/*.json; do ' +
        '  [ -f "$f" ] && cat "$f" && echo "___FILE_SEP___"; ' +
        'done 2>/dev/null || echo "NO_LEARNINGS"'
      )
    }

    function parseLearningsOutput(stdout: string): LearningFile[] {
      if (stdout.includes('NO_LEARNINGS') || !stdout.trim()) {
        return []
      }
      const files: LearningFile[] = []
      const fileParts = stdout.split('___FILE_SEP___').filter((p) => p.trim())
      for (const part of fileParts) {
        try {
          const parsed = JSON.parse(part.trim()) as LearningFile
          if (parsed.agentId && Array.isArray(parsed.learnings)) {
            files.push(parsed)
          }
        } catch {
          // Skip malformed files
        }
      }
      return files
    }

    function applyConfidenceDecay(learnings: Learning[]): Learning[] {
      const now = Date.now()
      const decayMs = CONFIDENCE_DECAY_DAYS * 24 * 60 * 60 * 1000
      return learnings.map((l) => {
        const age = now - new Date(l.timestamp).getTime()
        if (age > decayMs && l.usageCount < CONFIDENCE_DECAY_MIN_USAGE) {
          return { ...l, confidence: Math.max(0.1, l.confidence * 0.5) }
        }
        return l
      })
    }

    function isDuplicate(existing: Learning[], candidate: { trigger?: string; category?: string; learning?: string }): boolean {
      const candidateKey = ((candidate.category || '') + ':' + (candidate.trigger || '') + ':' + (candidate.learning || '')).slice(0, 150).toLowerCase()
      return existing.some((l) => {
        const existingKey = (l.category + ':' + l.trigger + ':' + l.learning).slice(0, 150).toLowerCase()
        return existingKey === candidateKey
      })
    }

    function relevanceScore(l: Learning): number {
      return l.confidence * (Math.log(l.usageCount + 2) / Math.log(2))
    }

    function mergeLearningsWithCap(
      existing: Learning[],
      newLearnings: Learning[],
      maxPerAgent: number,
    ): Learning[] {
      let merged = [...existing, ...newLearnings]
      if (merged.length > maxPerAgent) {
        merged.sort((a, b) => relevanceScore(b) - relevanceScore(a))
        merged = merged.slice(0, maxPerAgent)
      }
      return merged
    }

    function filterAbsorbedLearnings(learnings: Learning[]): Learning[] {
      return learnings.filter((l) => !l.absorbed)
    }

    // =========================================================================
    // Determine mode
    // =========================================================================

    const mode = (params?.mode as string) || 'monitor'
    logger.info('Agent Monitor starting in mode: ' + mode)

    // =========================================================================
    // Step 1: Read existing learnings from disk
    // =========================================================================

    logger.info('Reading learnings from ' + LEARNINGS_DIR + '...')

    const { toolResult: readResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: buildReadCommand(LEARNINGS_DIR),
        timeout_seconds: 10,
      },
    }

    const learningsRaw = extractStdout(readResult)

    interface Learning {
      id: string
      timestamp: string
      agentId: string
      category: string
      trigger: string
      learning: string
      confidence: number
      usageCount: number
      lastUsed: string
      source: string
      absorbed?: boolean
      absorbedAt?: string
    }

    interface LearningFile {
      agentId: string
      learnings: Learning[]
    }

    const allLearnings: Learning[] = []
    const learningsByAgent: Record<string, Learning[]> = {}

    const parsedFiles = parseLearningsOutput(learningsRaw)
    for (const file of parsedFiles) {
      const decayed = applyConfidenceDecay(file.learnings)
      learningsByAgent[file.agentId] = decayed
      allLearnings.push(...decayed)
    }

    logger.info('Loaded ' + allLearnings.length + ' learnings across ' + Object.keys(learningsByAgent).length + ' agents')

    // =========================================================================
    // MODE: REVIEW
    // =========================================================================

    if (mode === 'review') {
      logger.info('Review mode — reading agent source files...')

      const catCmd =
        'for f in ' + AGENT_SOURCE_FILES.join(' ') + '; do ' +
        'echo "=== $f ==="; cat "$f" 2>/dev/null; echo; done'
      const { toolResult: filesResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: catCmd, timeout_seconds: 15 },
      }
      const filesContent = extractStdout(filesResult)

      // Build stats summary
      const statsByAgent: Record<string, Record<string, number>> = {}
      const statsByCategory: Record<string, number> = {}

      for (const learning of allLearnings) {
        if (!statsByAgent[learning.agentId]) statsByAgent[learning.agentId] = {}
        const agentStats = statsByAgent[learning.agentId]
        agentStats[learning.category] = (agentStats[learning.category] || 0) + 1
        statsByCategory[learning.category] = (statsByCategory[learning.category] || 0) + 1
      }

      let statsText = '## Estatísticas dos Learnings\n\n'
      statsText += '**Total de learnings:** ' + allLearnings.length + '\n\n'

      if (allLearnings.length > 0) {
        statsText += '### Por Agent\n'
        for (const [agentId, cats] of Object.entries(statsByAgent)) {
          const total = Object.values(cats).reduce((a, b) => a + b, 0)
          const catList = Object.entries(cats).map(([c, n]) => c + ': ' + n).join(', ')
          statsText += '- **' + agentId + '**: ' + total + ' (' + catList + ')\n'
        }

        statsText += '\n### Por Categoria\n'
        for (const [cat, count] of Object.entries(statsByCategory)) {
          statsText += '- **' + cat + '**: ' + count + '\n'
        }

        statsText += '\n### Top Learnings (por uso)\n'
        const sorted = [...allLearnings].sort((a, b) => b.usageCount - a.usageCount)
        for (const l of sorted.slice(0, 10)) {
          statsText +=
            '- [' + l.agentId + '/' + l.category + '] ' +
            l.learning.slice(0, 120) +
            ' (usado ' + l.usageCount + 'x, confiança: ' + l.confidence + ')\n'
        }

        statsText += '\n### Learnings com Baixa Confiança (candidatos a remoção)\n'
        const lowConfidence = allLearnings.filter((l) => l.confidence < 0.6)
        if (lowConfidence.length > 0) {
          for (const l of lowConfidence) {
            statsText +=
              '- [' + l.agentId + '] ' +
              l.learning.slice(0, 100) +
              ' (confiança: ' + l.confidence + ')\n'
          }
        } else {
          statsText += '- Nenhum learning com confiança abaixo de 0.6\n'
        }

        statsText += '\n### Learnings Absorvidos\n'
        const absorbed = allLearnings.filter((l) => l.absorbed)
        if (absorbed.length > 0) {
          for (const l of absorbed) {
            statsText +=
              '- [' + l.agentId + '/' + l.category + '] ' +
              l.learning.slice(0, 100) +
              ' (absorvido em: ' + (l.absorbedAt || 'data desconhecida') + ')\n'
          }
        } else {
          statsText += '- Nenhum learning absorvido ainda\n'
        }
      } else {
        statsText += '⚠️ Nenhum learning acumulado ainda. Use o modo monitor para começar a aprender.\n'
      }

      // Build the complete learnings dump
      let learningsText = '\n## Todos os Learnings (JSON)\n\n'
      learningsText += '```json\n' + JSON.stringify(allLearnings, null, 2) + '\n```\n'

      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            '=== REVIEW MODE — ANÁLISE DE LEARNINGS ===\n\n' +
            statsText +
            learningsText +
            '\n\n=== CÓDIGO-FONTE DOS AGENTS ===\n\n' +
            filesContent +
            '\n\n---\n\n' +
            'Analise os learnings acumulados em conjunto com o código-fonte dos agents e produza um relatório completo com:\n\n' +
            '1. **Resumo executivo** dos padrões observados\n' +
            '2. **Sugestões de melhoria nos prompts** — para cada agent, indique trechos específicos que devem ser adicionados/alterados no systemPrompt ou instructionsPrompt, baseado nos learnings\n' +
            '3. **Novos padrões** — comportamentos recorrentes que justificam mudanças estruturais\n' +
            '4. **Learnings obsoletos** — IDs de learnings com baixa confiança ou desatualizados para remoção\n' +
            '5. **Melhorias de UX** — sugestões para melhorar a experiência do usuário\n\n' +
            'Seja específico — inclua trechos de prompt prontos para copiar e usar.\n' +
            (prompt ? '\n\nFoco adicional do usuário: ' + prompt : ''),
        },
        includeToolCall: false,
      }

      yield 'STEP_ALL'

      // Step: Ask the LLM which learnings should be marked as absorbed
      if (allLearnings.length > 0) {
        const activeLearnings = filterAbsorbedLearnings(allLearnings)
        if (activeLearnings.length > 0) {
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                '=== ABSORÇÃO DE LEARNINGS ===\n\n' +
                'Com base no relatório acima, quais learnings devem ser marcados como "absorvidos" (removidos do contexto ativo)?\n\n' +
                'Absorva learnings que:\n' +
                '1. Já foram incorporados nos prompts dos agents\n' +
                '2. Estão obsoletos ou desatualizados\n' +
                '3. São redundantes com outros learnings mais recentes\n\n' +
                'Responda APENAS com um JSON array contendo os IDs dos learnings a absorver, por exemplo:\n' +
                '`["l_123_0", "l_456_1"]`\n\n' +
                'Se nenhum learning deve ser absorvido agora, responda com `[]`.\n\n' +
                'IDs disponíveis:\n' +
                activeLearnings.map((l) => '- `' + l.id + '` — [' + l.agentId + '/' + l.category + '] ' + l.learning.slice(0, 80)).join('\n'),
            },
            includeToolCall: false,
          }

          const { agentState: stateAfterAbsorb } = yield 'STEP'

          const absorbText = getLastAssistantText(stateAfterAbsorb.messageHistory)
          const absorbIds = extractJsonArray(absorbText) as string[]

          if (absorbIds.length > 0) {
            const absorbSet = new Set(absorbIds)
            const absorbedAt = new Date().toISOString()
            let absorbedCount = 0

            for (const [agentId, agentLearnings] of Object.entries(learningsByAgent)) {
              let updated = false
              for (const learning of agentLearnings) {
                if (absorbSet.has(learning.id) && !learning.absorbed) {
                  learning.absorbed = true
                  learning.absorbedAt = absorbedAt
                  updated = true
                  absorbedCount++
                }
              }

              if (updated) {
                const fileContent: LearningFile = { agentId, learnings: agentLearnings }
                const jsonStr = JSON.stringify(fileContent, null, 2)

                yield {
                  toolName: 'run_terminal_command',
                  input: {
                    command: buildPersistCommand(jsonStr, LEARNINGS_DIR + '/' + agentId + '.json', LEARNINGS_DIR),
                    timeout_seconds: 10,
                  },
                }
              }
            }

            logger.info('Absorbed ' + absorbedCount + ' learnings')
          } else {
            logger.info('No learnings marked for absorption')
          }
        }
      }

      return
    }

    // =========================================================================
    // MODE: MONITOR (default)
    // =========================================================================

    // Step 2: Filter and inject relevant learnings
    const relevantLearnings = filterAbsorbedLearnings(allLearnings)
      .filter((l) => l.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => relevanceScore(b) - relevanceScore(a))
      .slice(0, MAX_LEARNINGS_IN_CONTEXT)

    let contextMessage = '=== AGENT MONITOR — CONTEXTO APRENDIDO ===\n\n'

    if (relevantLearnings.length > 0) {
      contextMessage +=
        'Os seguintes learnings foram acumulados de interações anteriores. ' +
        'Use-os para melhorar a qualidade da sua resposta:\n\n'

      const groupedByAgent: Record<string, Learning[]> = {}
      for (const l of relevantLearnings) {
        if (!groupedByAgent[l.agentId]) groupedByAgent[l.agentId] = []
        groupedByAgent[l.agentId].push(l)
      }

      for (const [agentId, learnings] of Object.entries(groupedByAgent)) {
        contextMessage += '### ' + agentId + '\n'
        for (const l of learnings) {
          contextMessage +=
            '- [' + l.category + '] ' + l.learning +
            (l.trigger ? ' (trigger: ' + l.trigger + ')' : '') + '\n'
        }
        contextMessage += '\n'
      }
    } else {
      contextMessage +=
        'Nenhum learning acumulado ainda. Esta é uma das primeiras interações — ' +
        'learnings serão extraídos automaticamente ao final.\n\n'
    }

    contextMessage +=
      '---\n\n' +
      'Agents disponíveis para spawn: ' + MONITORED_AGENTS.join(', ') + '\n\n' +
      'IMPORTANTE: Você DEVE fazer EXATAMENTE UMA chamada a spawn_agents com o subagent mais adequado. ' +
      'Inclua os learnings relevantes no prompt do subagent. ' +
      'NÃO tente responder você mesmo — apenas delegue ao subagent e pare. ' +
      'Após o spawn, o resultado será retornado automaticamente ao agent principal que chamou o monitor.'

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: contextMessage,
      },
      includeToolCall: false,
    }

    // Step 3: Let the LLM spawn exactly one subagent (single step)
    logger.info('Delegating to LLM for subagent spawn...')
    yield 'STEP'

    // Step 4: Extract learnings from the interaction
    logger.info('Extracting learnings from the interaction...')

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content:
          '=== EXTRAÇÃO DE LEARNINGS ===\n\n' +
          'Analise a interação completa acima e extraia learnings acionáveis. ' +
          'Considere:\n' +
          '1. Houve algum erro? O que causou e como foi (ou deveria ter sido) resolvido?\n' +
          '2. A resposta foi eficiente? Poderia ter sido mais rápida ou precisa?\n' +
          '3. Algum padrão novo foi identificado (query útil, comando frequente, preferência)?\n' +
          '4. Alguma abordagem deve ser evitada no futuro?\n' +
          '5. O usuário fez correções ou pediu ajustes que indicam uma preferência?\n\n' +
          'Responda APENAS com um JSON array no seguinte formato (sem texto antes ou depois):\n\n' +
          '```json\n' +
          '[\n' +
          '  {\n' +
          '    "agentId": "nome-do-agent-usado",\n' +
          '    "category": "error_recovery|optimization|user_preference|best_practice|common_query|anti_pattern",\n' +
          '    "trigger": "Descrição curta do que aciona este learning",\n' +
          '    "learning": "O insight acionável aprendido",\n' +
          '    "confidence": 0.7,\n' +
          '    "source": "Breve descrição de como este learning foi derivado"\n' +
          '  }\n' +
          ']\n' +
          '```\n\n' +
          'Se nenhum learning novo for identificado, responda com `[]`.\n' +
          'Atribua confidence entre 0.5 (fraco) e 1.0 (certeza). ' +
          'Prefira poucos learnings de alta qualidade a muitos genéricos.',
      },
      includeToolCall: false,
    }

    const { agentState: stateAfterExtraction } = yield 'STEP'

    // Step 5: Parse and persist learnings
    const extractionText = getLastAssistantText(stateAfterExtraction.messageHistory)
    const extractedLearnings = extractJsonArray(extractionText) as Array<{
      agentId?: string
      category?: string
      trigger?: string
      learning?: string
      confidence?: number
      source?: string
    }>

    if (extractedLearnings.length === 0) {
      logger.info('No new learnings extracted from this interaction')
    } else {

    logger.info('Extracted ' + extractedLearnings.length + ' new learnings, persisting...')

    const now = new Date().toISOString()
    const timestamp = Date.now()

    // Group new learnings by agentId (with deduplication)
    const newByAgent: Record<string, Learning[]> = {}
    for (let i = 0; i < extractedLearnings.length; i++) {
      const raw = extractedLearnings[i]
      if (!raw.agentId || !raw.learning) continue

      const existing = learningsByAgent[raw.agentId] || []
      if (isDuplicate(existing, raw)) {
        logger.info('Skipping duplicate learning for ' + raw.agentId + ': ' + (raw.trigger || '').slice(0, 50))
        continue
      }

      const learning: Learning = {
        id: 'l_' + timestamp + '_' + i,
        timestamp: now,
        agentId: raw.agentId,
        category: raw.category || 'best_practice',
        trigger: raw.trigger || '',
        learning: raw.learning,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.7,
        usageCount: 0,
        lastUsed: now,
        source: raw.source || 'Extracted from interaction',
      }

      if (!newByAgent[learning.agentId]) newByAgent[learning.agentId] = []
      newByAgent[learning.agentId].push(learning)
    }

    // Merge, cap, and persist per agent
    for (const [agentId, newLearnings] of Object.entries(newByAgent)) {
      const existing = learningsByAgent[agentId] || []
      const merged = mergeLearningsWithCap(existing, newLearnings, MAX_LEARNINGS_PER_AGENT)

      if (merged.length < existing.length + newLearnings.length) {
        logger.info('Capped ' + agentId + ' learnings to ' + MAX_LEARNINGS_PER_AGENT)
      }

      const fileContent: LearningFile = {
        agentId,
        learnings: merged,
      }

      const jsonStr = JSON.stringify(fileContent, null, 2)

      yield {
        toolName: 'run_terminal_command',
        input: {
          command: buildPersistCommand(jsonStr, LEARNINGS_DIR + '/' + agentId + '.json', LEARNINGS_DIR),
          timeout_seconds: 10,
        },
      }

      logger.info('Persisted ' + newLearnings.length + ' learnings for ' + agentId)
    }

    // Update usage count for learnings that were injected in context
    if (relevantLearnings.length > 0) {
      const usedAgentIds = new Set(relevantLearnings.map((l) => l.agentId))

      for (const agentId of usedAgentIds) {
        const agentLearnings = learningsByAgent[agentId]
        if (!agentLearnings) continue

        let updated = false
        for (const learning of agentLearnings) {
          if (relevantLearnings.some((rl) => rl.id === learning.id)) {
            learning.usageCount++
            learning.lastUsed = now
            updated = true
          }
        }

        if (updated) {
          const fileContent: LearningFile = {
            agentId,
            learnings: agentLearnings,
          }

          const jsonStr = JSON.stringify(fileContent, null, 2)

          yield {
            toolName: 'run_terminal_command',
            input: {
              command: buildPersistCommand(jsonStr, LEARNINGS_DIR + '/' + agentId + '.json', LEARNINGS_DIR),
              timeout_seconds: 10,
            },
          }
        }
      }
    }

    logger.info('Agent Monitor completed — learnings persisted successfully')
    } // end else (extractedLearnings.length > 0)

    // Final step: relay the sub-agent's response as the last message for the parent
    // This ensures outputMode 'last_message' returns the useful response, not the learning JSON
    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content:
          'Agora forneça a resposta final ao usuário com base no resultado do subagent acima. ' +
          'Repasse o conteúdo do subagent de forma direta e útil, sem mencionar learnings ou processos internos.',
      },
      includeToolCall: false,
    }

    yield 'STEP'

    logger.info('Agent Monitor — final response relayed to parent')
  },
}

export default definition
