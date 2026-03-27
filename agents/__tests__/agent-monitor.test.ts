import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import agentMonitor, {
  type Learning,
  type LearningFile,
  applyConfidenceDecay,
  isDuplicate,
  relevanceScore,
  mergeLearningsWithCap,
  buildPersistCommand,
  buildReadCommand,
  parseLearningsOutput,
  extractJsonArray,
  toBase64,
  extractStdout,
  getLastAssistantText,
  filterAbsorbedLearnings,
} from '../agent-monitor'

function createLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'l_1000_0',
    timestamp: new Date().toISOString(),
    agentId: 'dynatrace-agent',
    category: 'best_practice',
    trigger: 'some trigger',
    learning: 'some learning',
    confidence: 0.8,
    usageCount: 1,
    lastUsed: new Date().toISOString(),
    source: 'test',
    ...overrides,
  }
}

describe('agent-monitor', () => {
  describe('definition', () => {
    test('has correct id', () => {
      expect(agentMonitor.id).toBe('agent-monitor')
    })

    test('has display name', () => {
      expect(agentMonitor.displayName).toBe('Agent Monitor')
    })

    test('has output mode set to last_message', () => {
      expect(agentMonitor.outputMode).toBe('last_message')
    })

    test('includes message history', () => {
      expect(agentMonitor.includeMessageHistory).toBe(true)
    })

    test('has required tools', () => {
      expect(agentMonitor.toolNames).toContain('run_terminal_command')
      expect(agentMonitor.toolNames).toContain('add_message')
      expect(agentMonitor.toolNames).toContain('spawn_agents')
      expect(agentMonitor.toolNames).toContain('read_files')
    })

    test('has all infrastructure agents as spawnable', () => {
      expect(agentMonitor.spawnableAgents).toContain('dynatrace-agent')
      expect(agentMonitor.spawnableAgents).toContain('atlassian')
      expect(agentMonitor.spawnableAgents).toContain('github-agent')
      expect(agentMonitor.spawnableAgents).toContain('slack-agent')
      expect(agentMonitor.spawnableAgents).toContain('sonar-agent')
      expect(agentMonitor.spawnableAgents).toContain('hoop-agent')
      expect(agentMonitor.spawnableAgents).toContain('pai-agent')
      expect(agentMonitor.spawnableAgents).toContain('pai-researcher')
    })

    test('has handleSteps defined', () => {
      expect(agentMonitor.handleSteps).toBeDefined()
      expect(typeof agentMonitor.handleSteps).toBe('function')
    })
  })

  describe('applyConfidenceDecay', () => {
    const DECAY_DAYS = 30
    const MIN_USAGE = 2

    test('does not decay recent learnings', () => {
      const learning = createLearning({
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        usageCount: 0,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.9)
    })

    test('does not decay old learnings with sufficient usage', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learning = createLearning({
        timestamp: old.toISOString(),
        confidence: 0.9,
        usageCount: 5,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.9)
    })

    test('decays old learnings with low usage', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learning = createLearning({
        timestamp: old.toISOString(),
        confidence: 0.8,
        usageCount: 1,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.4)
    })

    test('enforces minimum confidence of 0.1', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learning = createLearning({
        timestamp: old.toISOString(),
        confidence: 0.15,
        usageCount: 0,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.1)
    })

    test('returns empty array for empty input', () => {
      const result = applyConfidenceDecay([], DECAY_DAYS, MIN_USAGE)
      expect(result).toEqual([])
    })

    test('does not mutate the original array', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learning = createLearning({
        timestamp: old.toISOString(),
        confidence: 0.8,
        usageCount: 0,
      })
      const original = [learning]

      applyConfidenceDecay(original, DECAY_DAYS, MIN_USAGE)
      expect(original[0].confidence).toBe(0.8)
    })

    test('applies decay to exactly the threshold boundary', () => {
      const exactlyAtThreshold = new Date()
      exactlyAtThreshold.setDate(exactlyAtThreshold.getDate() - 30)
      exactlyAtThreshold.setMinutes(exactlyAtThreshold.getMinutes() - 1)
      const learning = createLearning({
        timestamp: exactlyAtThreshold.toISOString(),
        confidence: 0.6,
        usageCount: 1,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.3)
    })

    test('does not decay learning at exactly min usage threshold', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learning = createLearning({
        timestamp: old.toISOString(),
        confidence: 0.9,
        usageCount: 2,
      })

      const result = applyConfidenceDecay([learning], DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.9)
    })

    test('handles multiple learnings with mixed decay eligibility', () => {
      const old = new Date()
      old.setDate(old.getDate() - 60)
      const learnings = [
        createLearning({ id: 'l1', timestamp: new Date().toISOString(), confidence: 0.9, usageCount: 0 }),
        createLearning({ id: 'l2', timestamp: old.toISOString(), confidence: 0.8, usageCount: 0 }),
        createLearning({ id: 'l3', timestamp: old.toISOString(), confidence: 0.8, usageCount: 5 }),
      ]

      const result = applyConfidenceDecay(learnings, DECAY_DAYS, MIN_USAGE)
      expect(result[0].confidence).toBe(0.9)
      expect(result[1].confidence).toBe(0.4)
      expect(result[2].confidence).toBe(0.8)
    })
  })

  describe('isDuplicate', () => {
    test('detects exact duplicate', () => {
      const existing = [createLearning({
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'regenerate token',
      })]

      const result = isDuplicate(existing, {
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'regenerate token',
      })
      expect(result).toBe(true)
    })

    test('detects case-insensitive duplicate', () => {
      const existing = [createLearning({
        category: 'Error_Recovery',
        trigger: 'Token Expired',
        learning: 'Regenerate Token',
      })]

      const result = isDuplicate(existing, {
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'regenerate token',
      })
      expect(result).toBe(true)
    })

    test('returns false for different learning text', () => {
      const existing = [createLearning({
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'regenerate token',
      })]

      const result = isDuplicate(existing, {
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'use refresh token instead',
      })
      expect(result).toBe(false)
    })

    test('returns false for empty existing array', () => {
      const result = isDuplicate([], {
        category: 'error_recovery',
        trigger: 'token expired',
        learning: 'regenerate token',
      })
      expect(result).toBe(false)
    })

    test('handles missing fields in candidate gracefully', () => {
      const existing = [createLearning({
        category: 'best_practice',
        trigger: '',
        learning: 'some learning',
      })]

      const result = isDuplicate(existing, { learning: 'some learning' })
      expect(result).toBe(false)
    })

    test('handles candidate with only category matching', () => {
      const existing = [createLearning({
        category: 'optimization',
        trigger: 'slow query',
        learning: 'add index',
      })]

      const result = isDuplicate(existing, {
        category: 'optimization',
        trigger: 'different trigger',
        learning: 'different learning',
      })
      expect(result).toBe(false)
    })

    test('truncates long keys to 150 characters for comparison', () => {
      const longText = 'a'.repeat(200)
      const existing = [createLearning({
        category: 'best_practice',
        trigger: '',
        learning: longText,
      })]

      const result = isDuplicate(existing, {
        category: 'best_practice',
        trigger: '',
        learning: longText.slice(0, 140) + 'DIFFERENT_ENDING',
      })
      expect(result).toBe(true)
    })
  })

  describe('relevanceScore', () => {
    test('higher confidence produces higher score', () => {
      const high = createLearning({ confidence: 0.9, usageCount: 1 })
      const low = createLearning({ confidence: 0.3, usageCount: 1 })

      expect(relevanceScore(high)).toBeGreaterThan(relevanceScore(low))
    })

    test('higher usage count produces higher score', () => {
      const highUsage = createLearning({ confidence: 0.8, usageCount: 10 })
      const lowUsage = createLearning({ confidence: 0.8, usageCount: 0 })

      expect(relevanceScore(highUsage)).toBeGreaterThan(relevanceScore(lowUsage))
    })

    test('computes correct formula: confidence * log2(usageCount + 2)', () => {
      const learning = createLearning({ confidence: 1.0, usageCount: 6 })

      // log2(6 + 2) = log2(8) = 3.0
      expect(relevanceScore(learning)).toBeCloseTo(3.0, 5)
    })

    test('returns confidence * 1 when usage is 0', () => {
      const learning = createLearning({ confidence: 0.7, usageCount: 0 })

      // log2(0 + 2) = log2(2) = 1.0
      expect(relevanceScore(learning)).toBeCloseTo(0.7, 5)
    })

    test('zero confidence always returns zero', () => {
      const learning = createLearning({ confidence: 0, usageCount: 100 })
      expect(relevanceScore(learning)).toBe(0)
    })
  })

  describe('mergeLearningsWithCap', () => {
    test('merges learnings when total is under cap', () => {
      const existing = [
        createLearning({ id: 'e1', confidence: 0.8, usageCount: 2 }),
        createLearning({ id: 'e2', confidence: 0.7, usageCount: 1 }),
      ]
      const newOnes = [
        createLearning({ id: 'n1', confidence: 0.9, usageCount: 0 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 50)
      expect(result).toHaveLength(3)
      expect(result.map((l) => l.id)).toEqual(['e1', 'e2', 'n1'])
    })

    test('returns all learnings when exactly at cap', () => {
      const existing = [
        createLearning({ id: 'e1', confidence: 0.8, usageCount: 1 }),
        createLearning({ id: 'e2', confidence: 0.7, usageCount: 1 }),
      ]
      const newOnes = [
        createLearning({ id: 'n1', confidence: 0.9, usageCount: 1 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 3)
      expect(result).toHaveLength(3)
    })

    test('drops lowest relevance learnings when over cap', () => {
      const existing = [
        createLearning({ id: 'high', confidence: 0.9, usageCount: 5 }),
        createLearning({ id: 'low', confidence: 0.2, usageCount: 0 }),
      ]
      const newOnes = [
        createLearning({ id: 'medium', confidence: 0.7, usageCount: 2 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 2)
      expect(result).toHaveLength(2)
      const ids = result.map((l) => l.id)
      expect(ids).toContain('high')
      expect(ids).toContain('medium')
      expect(ids).not.toContain('low')
    })

    test('handles empty existing array', () => {
      const newOnes = [
        createLearning({ id: 'n1', confidence: 0.8, usageCount: 1 }),
        createLearning({ id: 'n2', confidence: 0.6, usageCount: 0 }),
      ]

      const result = mergeLearningsWithCap([], newOnes, 50)
      expect(result).toHaveLength(2)
    })

    test('handles empty new learnings array', () => {
      const existing = [
        createLearning({ id: 'e1', confidence: 0.8, usageCount: 1 }),
      ]

      const result = mergeLearningsWithCap(existing, [], 50)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('e1')
    })

    test('handles both arrays empty', () => {
      const result = mergeLearningsWithCap([], [], 50)
      expect(result).toEqual([])
    })

    test('does not mutate input arrays', () => {
      const existing = [
        createLearning({ id: 'e1', confidence: 0.3, usageCount: 0 }),
        createLearning({ id: 'e2', confidence: 0.2, usageCount: 0 }),
      ]
      const newOnes = [
        createLearning({ id: 'n1', confidence: 0.9, usageCount: 5 }),
      ]
      const existingCopy = [...existing]
      const newCopy = [...newOnes]

      mergeLearningsWithCap(existing, newOnes, 2)

      expect(existing).toEqual(existingCopy)
      expect(newOnes).toEqual(newCopy)
    })

    test('cap of 1 keeps only the highest relevance learning', () => {
      const existing = [
        createLearning({ id: 'low', confidence: 0.3, usageCount: 0 }),
      ]
      const newOnes = [
        createLearning({ id: 'high', confidence: 0.95, usageCount: 10 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 1)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('high')
    })

    test('high confidence new learnings beat low confidence existing ones', () => {
      const existing = Array.from({ length: 5 }, (_, i) =>
        createLearning({ id: 'old_' + i, confidence: 0.3, usageCount: 0 }),
      )
      const newOnes = Array.from({ length: 3 }, (_, i) =>
        createLearning({ id: 'new_' + i, confidence: 0.95, usageCount: 3 }),
      )

      const result = mergeLearningsWithCap(existing, newOnes, 5)
      expect(result).toHaveLength(5)
      const ids = result.map((l) => l.id)
      expect(ids).toContain('new_0')
      expect(ids).toContain('new_1')
      expect(ids).toContain('new_2')
    })

    test('large merge: 100 existing + 10 new capped to 50 keeps top relevance', () => {
      const existing = Array.from({ length: 100 }, (_, i) =>
        createLearning({
          id: 'existing_' + i,
          confidence: (i + 1) / 100,
          usageCount: i % 5,
        }),
      )
      const newOnes = Array.from({ length: 10 }, (_, i) =>
        createLearning({
          id: 'new_' + i,
          confidence: 0.99,
          usageCount: 10 + i,
        }),
      )

      const result = mergeLearningsWithCap(existing, newOnes, 50)
      expect(result).toHaveLength(50)

      // All new learnings should be included (they have highest relevance)
      const ids = result.map((l) => l.id)
      for (let i = 0; i < 10; i++) {
        expect(ids).toContain('new_' + i)
      }
    })

    test('dropped learnings are always the lowest relevance ones', () => {
      const learnings = Array.from({ length: 10 }, (_, i) =>
        createLearning({
          id: 'l_' + i,
          confidence: (i + 1) / 10,
          usageCount: i,
        }),
      )

      const result = mergeLearningsWithCap(learnings, [], 5)
      expect(result).toHaveLength(5)

      // Compute scores for all original learnings and verify top 5 were kept
      const allScored = learnings
        .map((l) => ({ id: l.id, score: relevanceScore(l) }))
        .sort((a, b) => b.score - a.score)
      const topIds = allScored.slice(0, 5).map((s) => s.id)
      const resultIds = result.map((l) => l.id)

      expect(resultIds.sort()).toEqual(topIds.sort())
    })

    test('result is sorted by descending relevance when cap is applied', () => {
      const existing = [
        createLearning({ id: 'a', confidence: 0.5, usageCount: 0 }),
        createLearning({ id: 'b', confidence: 0.9, usageCount: 5 }),
      ]
      const newOnes = [
        createLearning({ id: 'c', confidence: 0.7, usageCount: 2 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 2)
      expect(result).toHaveLength(2)
      expect(relevanceScore(result[0])).toBeGreaterThanOrEqual(relevanceScore(result[1]))
    })

    test('preserves original order when under cap (no sorting needed)', () => {
      const existing = [
        createLearning({ id: 'first', confidence: 0.3, usageCount: 0 }),
        createLearning({ id: 'second', confidence: 0.9, usageCount: 5 }),
      ]
      const newOnes = [
        createLearning({ id: 'third', confidence: 0.5, usageCount: 1 }),
      ]

      const result = mergeLearningsWithCap(existing, newOnes, 10)
      expect(result.map((l) => l.id)).toEqual(['first', 'second', 'third'])
    })
  })

  describe('buildPersistCommand', () => {
    test('returns command with mkdir, base64 decode, and atomic mv', () => {
      const cmd = buildPersistCommand('{"test": true}', '/tmp/test.json', '/tmp/learnings')
      expect(cmd).toContain('mkdir -p /tmp/learnings')
      expect(cmd).toContain('base64 -d > /tmp/test.json.tmp.$$')
      expect(cmd).toContain('mv /tmp/test.json.tmp.$$ /tmp/test.json')
    })

    test('uses provided learningsDir for mkdir', () => {
      const cmd = buildPersistCommand('{}', '/a/b.json', '/custom/dir')
      expect(cmd).toContain('mkdir -p /custom/dir')
    })

    test('encodes JSON content as base64', () => {
      const json = '{"agentId":"test","learnings":[]}'
      const cmd = buildPersistCommand(json, '/tmp/test.json', '/tmp')
      const expectedB64 = toBase64(json)
      expect(cmd).toContain(expectedB64)
    })

    test('produces valid shell command structure with atomic rename', () => {
      const cmd = buildPersistCommand('{"a":1}', '/tmp/out.json', '/tmp/dir')
      expect(cmd).toMatch(/^mkdir -p .+ && echo '.+' \| base64 -d > .+\.tmp\.\$\$ && mv .+\.tmp\.\$\$ .+$/)
    })
  })

  describe('buildReadCommand', () => {
    test('returns command with correct directory', () => {
      const cmd = buildReadCommand('/tmp/learnings')
      expect(cmd).toContain('mkdir -p /tmp/learnings')
      expect(cmd).toContain('/tmp/learnings/*.json')
    })

    test('includes FILE_SEP delimiter', () => {
      const cmd = buildReadCommand('/any/dir')
      expect(cmd).toContain('___FILE_SEP___')
    })

    test('includes NO_LEARNINGS fallback', () => {
      const cmd = buildReadCommand('/any/dir')
      expect(cmd).toContain('NO_LEARNINGS')
    })
  })

  describe('parseLearningsOutput', () => {
    test('parses single learning file', () => {
      const file: LearningFile = {
        agentId: 'dynatrace-agent',
        learnings: [createLearning({ agentId: 'dynatrace-agent' })],
      }
      const stdout = JSON.stringify(file) + '\n___FILE_SEP___\n'
      const result = parseLearningsOutput(stdout)
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe('dynatrace-agent')
      expect(result[0].learnings).toHaveLength(1)
    })

    test('parses multiple learning files', () => {
      const file1: LearningFile = {
        agentId: 'dynatrace-agent',
        learnings: [createLearning({ agentId: 'dynatrace-agent' })],
      }
      const file2: LearningFile = {
        agentId: 'github-agent',
        learnings: [createLearning({ agentId: 'github-agent' })],
      }
      const stdout =
        JSON.stringify(file1) + '\n___FILE_SEP___\n' +
        JSON.stringify(file2) + '\n___FILE_SEP___\n'
      const result = parseLearningsOutput(stdout)
      expect(result).toHaveLength(2)
      expect(result[0].agentId).toBe('dynatrace-agent')
      expect(result[1].agentId).toBe('github-agent')
    })

    test('returns empty array for NO_LEARNINGS', () => {
      expect(parseLearningsOutput('NO_LEARNINGS\n')).toEqual([])
    })

    test('returns empty array for empty string', () => {
      expect(parseLearningsOutput('')).toEqual([])
    })

    test('returns empty array for whitespace only', () => {
      expect(parseLearningsOutput('   \n  ')).toEqual([])
    })

    test('skips malformed JSON', () => {
      const stdout = '{invalid json}\n___FILE_SEP___\n'
      expect(parseLearningsOutput(stdout)).toEqual([])
    })

    test('skips entries without agentId', () => {
      const stdout = JSON.stringify({ learnings: [] }) + '\n___FILE_SEP___\n'
      expect(parseLearningsOutput(stdout)).toEqual([])
    })

    test('skips entries without learnings array', () => {
      const stdout = JSON.stringify({ agentId: 'test', learnings: 'not-array' }) + '\n___FILE_SEP___\n'
      expect(parseLearningsOutput(stdout)).toEqual([])
    })

    test('skips malformed entries but keeps valid ones', () => {
      const valid: LearningFile = {
        agentId: 'github-agent',
        learnings: [createLearning({ agentId: 'github-agent' })],
      }
      const stdout =
        '{bad json}\n___FILE_SEP___\n' +
        JSON.stringify(valid) + '\n___FILE_SEP___\n'
      const result = parseLearningsOutput(stdout)
      expect(result).toHaveLength(1)
      expect(result[0].agentId).toBe('github-agent')
    })
  })

  describe('file I/O integration', () => {
    let tmpDir: string

    async function execShell(cmd: string): Promise<string> {
      const proc = Bun.spawn(['bash', '-c', cmd], { stdout: 'pipe', stderr: 'pipe' })
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`Shell command failed (exit ${exitCode}): ${stderr}`)
      }
      return stdout
    }

    beforeAll(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'agent-monitor-test-'))
    })

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    test('write single file and read back', async () => {
      const dir = join(tmpDir, 'single')
      const file: LearningFile = {
        agentId: 'dynatrace-agent',
        learnings: [createLearning({ agentId: 'dynatrace-agent', learning: 'test learning' })],
      }
      const jsonStr = JSON.stringify(file, null, 2)

      const writeCmd = buildPersistCommand(jsonStr, dir + '/dynatrace-agent.json', dir)
      await execShell(writeCmd)

      const readCmd = buildReadCommand(dir)
      const readOutput = await execShell(readCmd)
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].agentId).toBe('dynatrace-agent')
      expect(parsed[0].learnings[0].learning).toBe('test learning')
    })

    test('write multiple agent files and read all', async () => {
      const dir = join(tmpDir, 'multi')
      const file1: LearningFile = {
        agentId: 'github-agent',
        learnings: [createLearning({ agentId: 'github-agent', id: 'g1' })],
      }
      const file2: LearningFile = {
        agentId: 'slack-agent',
        learnings: [
          createLearning({ agentId: 'slack-agent', id: 's1' }),
          createLearning({ agentId: 'slack-agent', id: 's2' }),
        ],
      }

      await execShell(buildPersistCommand(JSON.stringify(file1, null, 2), dir + '/github-agent.json', dir))
      await execShell(buildPersistCommand(JSON.stringify(file2, null, 2), dir + '/slack-agent.json', dir))

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(2)
      const agentIds = parsed.map((f) => f.agentId).sort()
      expect(agentIds).toEqual(['github-agent', 'slack-agent'])

      const slackFile = parsed.find((f) => f.agentId === 'slack-agent')
      expect(slackFile?.learnings).toHaveLength(2)
    })

    test('UTF-8 roundtrip with Portuguese text', async () => {
      const dir = join(tmpDir, 'utf8')
      const file: LearningFile = {
        agentId: 'atlassian',
        learnings: [createLearning({
          agentId: 'atlassian',
          trigger: 'Token expirado retornando HTTP 401',
          learning: 'Quando o token retorna 401, sugerir ao usuário regenerar o token antes de tentar novamente',
          source: 'Observação de 3 interações falhadas com mesmo padrão',
        })],
      }

      await execShell(buildPersistCommand(JSON.stringify(file, null, 2), dir + '/atlassian.json', dir))

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].learnings[0].trigger).toBe('Token expirado retornando HTTP 401')
      expect(parsed[0].learnings[0].learning).toContain('sugerir ao usuário')
      expect(parsed[0].learnings[0].source).toContain('interações falhadas')
    })

    test('empty dir returns NO_LEARNINGS in read output', async () => {
      const dir = join(tmpDir, 'empty')
      await execShell('mkdir -p ' + dir)

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toEqual([])
    })

    test('overwrite file with new content', async () => {
      const dir = join(tmpDir, 'overwrite')
      const original: LearningFile = {
        agentId: 'sonar-agent',
        learnings: [createLearning({ agentId: 'sonar-agent', learning: 'original' })],
      }
      const updated: LearningFile = {
        agentId: 'sonar-agent',
        learnings: [
          createLearning({ agentId: 'sonar-agent', id: 'l1', learning: 'updated first' }),
          createLearning({ agentId: 'sonar-agent', id: 'l2', learning: 'new second' }),
        ],
      }

      const filePath = dir + '/sonar-agent.json'
      await execShell(buildPersistCommand(JSON.stringify(original, null, 2), filePath, dir))
      await execShell(buildPersistCommand(JSON.stringify(updated, null, 2), filePath, dir))

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].learnings).toHaveLength(2)
      expect(parsed[0].learnings[0].learning).toBe('updated first')
      expect(parsed[0].learnings[1].learning).toBe('new second')
    })

    test('large file with 50 learnings roundtrip', async () => {
      const dir = join(tmpDir, 'large')
      const learnings = Array.from({ length: 50 }, (_, i) =>
        createLearning({
          id: 'l_' + i,
          agentId: 'hoop-agent',
          category: i % 2 === 0 ? 'best_practice' : 'optimization',
          trigger: 'trigger ' + i,
          learning: 'learning number ' + i + ' with some detail',
          confidence: (i + 1) / 50,
          usageCount: i,
        }),
      )
      const file: LearningFile = { agentId: 'hoop-agent', learnings }

      await execShell(buildPersistCommand(JSON.stringify(file, null, 2), dir + '/hoop-agent.json', dir))

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].learnings).toHaveLength(50)
      expect(parsed[0].learnings[0].id).toBe('l_0')
      expect(parsed[0].learnings[49].id).toBe('l_49')
    })

    test('full field-level equality roundtrip', async () => {
      const dir = join(tmpDir, 'equality')
      const learning: Learning = {
        id: 'l_precise_001',
        timestamp: '2024-06-15T10:30:00.000Z',
        agentId: 'dynatrace-agent',
        category: 'error_recovery',
        trigger: 'DQL query timeout',
        learning: 'Always set scanLimitGBytes and timeframe to avoid costly queries',
        confidence: 0.95,
        usageCount: 7,
        lastUsed: '2024-06-20T14:00:00.000Z',
        source: 'User reported high cost after unbounded query',
      }
      const file: LearningFile = { agentId: 'dynatrace-agent', learnings: [learning] }

      await execShell(buildPersistCommand(JSON.stringify(file, null, 2), dir + '/dynatrace-agent.json', dir))

      const readOutput = await execShell(buildReadCommand(dir))
      const parsed = parseLearningsOutput(readOutput)

      expect(parsed).toHaveLength(1)
      const roundtripped = parsed[0].learnings[0]
      expect(roundtripped).toEqual(learning)
    })

    describe('concurrent write safety', () => {
      test('concurrent writes to same file produce valid JSON from one writer', async () => {
        const dir = join(tmpDir, 'concurrent-same')
        const filePath = dir + '/test-agent.json'
        const writes = Array.from({ length: 10 }, (_, i) => {
          const file: LearningFile = {
            agentId: 'test-agent',
            learnings: [createLearning({
              id: 'concurrent_' + i,
              agentId: 'test-agent',
              learning: 'learning from writer ' + i,
            })],
          }
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const raw = await execShell('cat ' + filePath)
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw) as LearningFile
        expect(parsed.agentId).toBe('test-agent')
        expect(Array.isArray(parsed.learnings)).toBe(true)
        expect(parsed.learnings).toHaveLength(1)
        expect(parsed.learnings[0].id).toMatch(/^concurrent_\d$/)
      })

      test('concurrent writes to different files all succeed', async () => {
        const dir = join(tmpDir, 'concurrent-diff')
        const writes = Array.from({ length: 10 }, (_, i) => {
          const file: LearningFile = {
            agentId: 'agent-' + i,
            learnings: [createLearning({
              id: 'diff_' + i,
              agentId: 'agent-' + i,
              learning: 'learning for agent ' + i,
            })],
          }
          const filePath = dir + '/agent-' + i + '.json'
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const readOutput = await execShell(buildReadCommand(dir))
        const parsed = parseLearningsOutput(readOutput)
        expect(parsed).toHaveLength(10)
        const agentIds = parsed.map((f) => f.agentId).sort()
        const expected = Array.from({ length: 10 }, (_, i) => 'agent-' + i).sort()
        expect(agentIds).toEqual(expected)
      })

      test('rapid sequential overwrites — last write wins', async () => {
        const dir = join(tmpDir, 'sequential')
        const filePath = dir + '/seq-agent.json'

        for (let i = 0; i < 20; i++) {
          const file: LearningFile = {
            agentId: 'seq-agent',
            learnings: [createLearning({
              id: 'seq_' + i,
              agentId: 'seq-agent',
              learning: 'sequential write number ' + i,
            })],
          }
          await execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        }

        const raw = await execShell('cat ' + filePath)
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw) as LearningFile
        expect(parsed.agentId).toBe('seq-agent')
        expect(parsed.learnings[0].id).toBe('seq_19')
        expect(parsed.learnings[0].learning).toBe('sequential write number 19')
      })

      test('large payload concurrent writes do not corrupt data', async () => {
        const dir = join(tmpDir, 'concurrent-large')
        const filePath = dir + '/large-agent.json'
        const writes = Array.from({ length: 5 }, (_, i) => {
          const learnings = Array.from({ length: 50 }, (_, j) =>
            createLearning({
              id: 'large_' + i + '_' + j,
              agentId: 'large-agent',
              learning: 'learning ' + j + ' from writer ' + i + ' with padding '.repeat(5),
              confidence: (j + 1) / 50,
              usageCount: j,
            }),
          )
          const file: LearningFile = { agentId: 'large-agent', learnings }
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const raw = await execShell('cat ' + filePath)
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw) as LearningFile
        expect(parsed.agentId).toBe('large-agent')
        expect(parsed.learnings).toHaveLength(50)
        // All learnings should be from the same writer (atomic write)
        const writerIds = new Set(parsed.learnings.map((l) => l.id.split('_')[1]))
        expect(writerIds.size).toBe(1)
      })

      test('concurrent overwrites never leave an empty or truncated file', async () => {
        const dir = join(tmpDir, 'no-empty')
        const filePath = dir + '/stable-agent.json'

        // Pre-write a file
        const initial: LearningFile = {
          agentId: 'stable-agent',
          learnings: [createLearning({ agentId: 'stable-agent', id: 'initial' })],
        }
        await execShell(buildPersistCommand(JSON.stringify(initial, null, 2), filePath, dir))

        // 10 concurrent overwrites
        const writes = Array.from({ length: 10 }, (_, i) => {
          const file: LearningFile = {
            agentId: 'stable-agent',
            learnings: [createLearning({
              id: 'overwrite_' + i,
              agentId: 'stable-agent',
              learning: 'overwrite ' + i,
            })],
          }
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const raw = await execShell('cat ' + filePath)
        expect(raw.trim().length).toBeGreaterThan(0)
        expect(() => JSON.parse(raw)).not.toThrow()
        const parsed = JSON.parse(raw) as LearningFile
        expect(parsed.agentId).toBe('stable-agent')
        expect(parsed.learnings).toHaveLength(1)
        expect(parsed.learnings[0].id).toMatch(/^overwrite_\d$/)
      })

      test('no temp file leftovers after concurrent writes', async () => {
        const dir = join(tmpDir, 'no-leftovers')
        const filePath = dir + '/clean-agent.json'
        const writes = Array.from({ length: 10 }, (_, i) => {
          const file: LearningFile = {
            agentId: 'clean-agent',
            learnings: [createLearning({
              id: 'clean_' + i,
              agentId: 'clean-agent',
            })],
          }
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const listing = await execShell('ls -1 ' + dir)
        const files = listing.trim().split('\n').filter((f) => f.length > 0)
        expect(files).toEqual(['clean-agent.json'])
      })

      test('concurrent writes are readable via production read pipeline', async () => {
        const dir = join(tmpDir, 'concurrent-pipeline')
        const filePath = dir + '/pipeline-agent.json'
        const writes = Array.from({ length: 10 }, (_, i) => {
          const file: LearningFile = {
            agentId: 'pipeline-agent',
            learnings: [createLearning({
              id: 'pipeline_' + i,
              agentId: 'pipeline-agent',
              learning: 'pipeline learning from writer ' + i,
            })],
          }
          return execShell(buildPersistCommand(JSON.stringify(file, null, 2), filePath, dir))
        })

        await Promise.all(writes)

        const readOutput = await execShell(buildReadCommand(dir))
        const parsed = parseLearningsOutput(readOutput)

        expect(parsed).toHaveLength(1)
        expect(parsed[0].agentId).toBe('pipeline-agent')
        expect(parsed[0].learnings).toHaveLength(1)
        expect(parsed[0].learnings[0].id).toMatch(/^pipeline_\d$/)
      })
    })
  })

  describe('extractJsonArray', () => {
    test('extracts JSON array from code fence', () => {
      const text = 'Some text\n```json\n[{"a": 1}, {"b": 2}]\n```\nMore text'
      const result = extractJsonArray(text)
      expect(result).toEqual([{ a: 1 }, { b: 2 }])
    })

    test('extracts JSON array from code fence without json label', () => {
      const text = '```\n[1, 2, 3]\n```'
      const result = extractJsonArray(text)
      expect(result).toEqual([1, 2, 3])
    })

    test('extracts bare JSON array', () => {
      const text = 'Here is the result: [{"id": "x"}]'
      const result = extractJsonArray(text)
      expect(result).toEqual([{ id: 'x' }])
    })

    test('returns empty array for invalid JSON in code fence', () => {
      const text = '```json\n[{invalid json}]\n```'
      const result = extractJsonArray(text)
      expect(result).toEqual([])
    })

    test('returns empty array for no JSON content', () => {
      const text = 'No JSON here at all'
      const result = extractJsonArray(text)
      expect(result).toEqual([])
    })

    test('returns empty array for empty string', () => {
      const result = extractJsonArray('')
      expect(result).toEqual([])
    })

    test('extracts empty JSON array', () => {
      const text = '```json\n[]\n```'
      const result = extractJsonArray(text)
      expect(result).toEqual([])
    })

    test('prefers code fence over bare array', () => {
      const text = '[1, 2]\n```json\n[3, 4]\n```'
      const result = extractJsonArray(text)
      expect(result).toEqual([3, 4])
    })
  })

  describe('toBase64', () => {
    test('encodes ASCII string correctly', () => {
      const result = toBase64('Hello')
      expect(result).toBe(Buffer.from('Hello').toString('base64'))
    })

    test('encodes empty string', () => {
      const result = toBase64('')
      expect(result).toBe('')
    })

    test('encodes UTF-8 characters correctly', () => {
      const result = toBase64('café')
      expect(result).toBe(Buffer.from('café').toString('base64'))
    })

    test('encodes JSON string correctly', () => {
      const json = '{"agentId":"test","learnings":[]}'
      const result = toBase64(json)
      expect(result).toBe(Buffer.from(json).toString('base64'))
    })

    test('handles special characters', () => {
      const str = 'line1\nline2\ttab'
      const result = toBase64(str)
      expect(result).toBe(Buffer.from(str).toString('base64'))
    })

    test('handles strings with length not divisible by 3', () => {
      expect(toBase64('a')).toBe(Buffer.from('a').toString('base64'))
      expect(toBase64('ab')).toBe(Buffer.from('ab').toString('base64'))
      expect(toBase64('abc')).toBe(Buffer.from('abc').toString('base64'))
    })
  })

  describe('extractStdout', () => {
    test('extracts stdout from standard tool result format', () => {
      const toolResult = [{ type: 'json', value: { stdout: 'hello world' } }]
      expect(extractStdout(toolResult)).toBe('hello world')
    })

    test('returns empty string for empty array', () => {
      expect(extractStdout([])).toBe('')
    })

    test('returns empty string for undefined', () => {
      expect(extractStdout(undefined)).toBe('')
    })

    test('returns empty string when stdout is not a string', () => {
      const toolResult = [{ type: 'json', value: { stdout: 123 } }]
      expect(extractStdout(toolResult)).toBe('')
    })

    test('returns empty string for non-json type', () => {
      const toolResult = [{ type: 'text', value: { stdout: 'hello' } }]
      expect(extractStdout(toolResult)).toBe('')
    })

    test('returns empty string when value has no stdout', () => {
      const toolResult = [{ type: 'json', value: { stderr: 'error' } }]
      expect(extractStdout(toolResult)).toBe('')
    })
  })

  describe('getLastAssistantText', () => {
    test('extracts string content from assistant message', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'response text' },
      ]
      expect(getLastAssistantText(messages)).toBe('response text')
    })

    test('extracts text from content array', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'part one' },
            { type: 'text', text: 'part two' },
          ],
        },
      ]
      expect(getLastAssistantText(messages)).toBe('part one\npart two')
    })

    test('skips non-text parts in content array', () => {
      const messages = [
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolName: 'read_files' },
            { type: 'text', text: 'the actual text' },
          ],
        },
      ]
      expect(getLastAssistantText(messages)).toBe('the actual text')
    })

    test('returns last assistant message, not first', () => {
      const messages = [
        { role: 'assistant', content: 'first response' },
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'second response' },
      ]
      expect(getLastAssistantText(messages)).toBe('second response')
    })

    test('returns empty string when no assistant messages', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'user', content: 'hello again' },
      ]
      expect(getLastAssistantText(messages)).toBe('')
    })

    test('returns empty string for empty array', () => {
      expect(getLastAssistantText([])).toBe('')
    })

    test('handles assistant message with empty content array', () => {
      const messages = [{ role: 'assistant', content: [] }]
      expect(getLastAssistantText(messages)).toBe('')
    })
  })

  describe('filterAbsorbedLearnings', () => {
    test('returns all learnings when none are absorbed', () => {
      const learnings = [
        createLearning({ id: 'l1' }),
        createLearning({ id: 'l2' }),
        createLearning({ id: 'l3' }),
      ]
      const result = filterAbsorbedLearnings(learnings)
      expect(result).toHaveLength(3)
      expect(result.map((l) => l.id)).toEqual(['l1', 'l2', 'l3'])
    })

    test('filters out absorbed learnings', () => {
      const learnings = [
        createLearning({ id: 'l1', absorbed: true, absorbedAt: '2024-06-15T10:00:00.000Z' }),
        createLearning({ id: 'l2' }),
        createLearning({ id: 'l3', absorbed: true, absorbedAt: '2024-06-16T10:00:00.000Z' }),
      ]
      const result = filterAbsorbedLearnings(learnings)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('l2')
    })

    test('returns empty array for all absorbed', () => {
      const learnings = [
        createLearning({ id: 'l1', absorbed: true }),
        createLearning({ id: 'l2', absorbed: true }),
      ]
      const result = filterAbsorbedLearnings(learnings)
      expect(result).toHaveLength(0)
    })

    test('returns empty array for empty input', () => {
      const result = filterAbsorbedLearnings([])
      expect(result).toEqual([])
    })

    test('treats undefined absorbed as not absorbed', () => {
      const learnings = [
        createLearning({ id: 'l1' }),
        createLearning({ id: 'l2' }),
      ]
      const result = filterAbsorbedLearnings(learnings)
      expect(result).toHaveLength(2)
    })
  })

  describe('handleSteps monitor mode flow', () => {
    function collectMonitorYields() {
      const handleStepsString = agentMonitor.handleSteps!.toString()
      const isolatedFunction = new Function(`return (${handleStepsString})`)()

      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = isolatedFunction({
        prompt: 'check dynatrace logs',
        params: { mode: 'monitor' },
        logger: mockLogger,
      })

      const yields: unknown[] = []
      let result = generator.next()

      while (!result.done) {
        yields.push(result.value)

        if (
          typeof result.value === 'object' &&
          result.value !== null &&
          (result.value as { toolName?: string }).toolName === 'run_terminal_command'
        ) {
          result = generator.next({
            toolResult: [{ type: 'json', value: { stdout: 'NO_LEARNINGS\n' } }],
          })
        } else if (result.value === 'STEP') {
          result = generator.next({
            agentState: {
              messageHistory: [{ role: 'assistant', content: '[]' }],
            },
          })
        } else {
          result = generator.next({})
        }
      }

      return yields
    }

    test('never yields STEP_ALL in monitor mode', () => {
      const yields = collectMonitorYields()
      expect(yields).not.toContain('STEP_ALL')
    })

    test('subagent delegation step (third yield) is STEP', () => {
      const yields = collectMonitorYields()
      expect(yields[2]).toBe('STEP')
    })

    test('last yielded value is STEP (final relay)', () => {
      const yields = collectMonitorYields()
      expect(yields[yields.length - 1]).toBe('STEP')
    })

    test('second-to-last yield is add_message with relay prompt', () => {
      const yields = collectMonitorYields()
      const secondToLast = yields[yields.length - 2] as { toolName?: string; input?: { content?: string } }
      expect(secondToLast.toolName).toBe('add_message')
      expect(secondToLast.input?.content).toContain('resposta final')
    })

    test('yields exactly 3 STEP strings in monitor mode (spawn, extraction, relay)', () => {
      const yields = collectMonitorYields()
      const stepYields = yields.filter((y) => y === 'STEP')
      expect(stepYields).toHaveLength(3)
    })

    test('review mode uses STEP_ALL for main analysis', () => {
      const handleStepsString = agentMonitor.handleSteps!.toString()
      const isolatedFunction = new Function(`return (${handleStepsString})`)()

      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = isolatedFunction({
        prompt: 'review learnings',
        params: { mode: 'review' },
        logger: mockLogger,
      })

      const yields: unknown[] = []
      let result = generator.next()

      while (!result.done) {
        yields.push(result.value)

        if (
          typeof result.value === 'object' &&
          result.value !== null &&
          (result.value as { toolName?: string }).toolName === 'run_terminal_command'
        ) {
          result = generator.next({
            toolResult: [{ type: 'json', value: { stdout: 'NO_LEARNINGS\n' } }],
          })
        } else if (result.value === 'STEP' || result.value === 'STEP_ALL') {
          result = generator.next({
            agentState: {
              messageHistory: [{ role: 'assistant', content: '[]' }],
            },
          })
        } else {
          result = generator.next({})
        }
      }

      expect(yields).toContain('STEP_ALL')
    })
  })

  describe('handleSteps serialization', () => {
    test('handleSteps can be serialized and executed in isolation (sandbox regression test)', () => {
      const handleStepsString = agentMonitor.handleSteps!.toString()

      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')

      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = isolatedFunction({
        prompt: 'test prompt',
        params: { mode: 'monitor' },
        logger: mockLogger,
      })

      const firstYield = generator.next()
      expect(firstYield.done).toBe(false)
      expect(firstYield.value).toEqual(
        expect.objectContaining({
          toolName: 'run_terminal_command',
        }),
      )
    })

    test('handleSteps serialization works for review mode', () => {
      const handleStepsString = agentMonitor.handleSteps!.toString()
      const isolatedFunction = new Function(`return (${handleStepsString})`)()

      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = isolatedFunction({
        prompt: 'review learnings',
        params: { mode: 'review' },
        logger: mockLogger,
      })

      const firstYield = generator.next()
      expect(firstYield.done).toBe(false)
      expect(firstYield.value).toEqual(
        expect.objectContaining({
          toolName: 'run_terminal_command',
        }),
      )
    })
  })
})
