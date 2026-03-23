import { describe, test, expect } from 'bun:test'

import { detectPrdExecViolation, getResolvedPrdRunbookPaths, prioritizeRunbooksByPrdPaths, PRD_RUNBOOK_PATHS } from '../hoop-agent'
import hoopAgent from '../hoop-agent'

describe('hoop-agent', () => {
  function createAssistantMessage(toolCalls: Array<{ toolName: string; command: string }>) {
    return {
      role: 'assistant',
      content: toolCalls.map((tc) => ({
        type: 'tool-call',
        toolCallId: 'test-id',
        toolName: tc.toolName,
        input: { command: tc.command },
      })),
    }
  }

  describe('definition', () => {
    test('has correct id', () => {
      expect(hoopAgent.id).toBe('hoop-agent')
    })

    test('has display name', () => {
      expect(hoopAgent.displayName).toBe('Hoop Agent')
    })

    test('has output mode set to last_message', () => {
      expect(hoopAgent.outputMode).toBe('last_message')
    })

    test('does not include message history', () => {
      expect(hoopAgent.includeMessageHistory).toBe(false)
    })

    test('has run_terminal_command and add_message tools', () => {
      expect(hoopAgent.toolNames).toContain('run_terminal_command')
      expect(hoopAgent.toolNames).toContain('add_message')
    })

    test('has handleSteps defined', () => {
      expect(hoopAgent.handleSteps).toBeDefined()
      expect(typeof hoopAgent.handleSteps).toBe('function')
    })
  })

  describe('detectPrdExecViolation', () => {
    const prdNames = [
      'ATLAS-MGO-CONSORTIUM-PRD-RO',
      'AWS-RDS-CONSORTIUM-PAYMENT-ENGINE-USE1-PRD-RO',
      'ATLAS-MGO-INSURANCE-PRD-RW',
    ]

    describe('exact name matching', () => {
      test('detects hoop exec on exact PRD connection name', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: "echo 'db.test.find()' > /tmp/hoop_query.tmp && hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/hoop_query.tmp < /dev/null 2>&1",
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-CONSORTIUM-PRD-RO')
      })

      test('detects hoop exec on PRD connection name case-insensitively', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec atlas-mgo-consortium-prd-ro -f /tmp/query.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-CONSORTIUM-PRD-RO')
      })

      test('detects hoop exec on MySQL PRD connection', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: "echo 'SELECT 1' > /tmp/hoop_query.tmp && hoop exec AWS-RDS-CONSORTIUM-PAYMENT-ENGINE-USE1-PRD-RO -f /tmp/hoop_query.tmp < /dev/null 2>&1",
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('AWS-RDS-CONSORTIUM-PAYMENT-ENGINE-USE1-PRD-RO')
      })
    })

    describe('pattern-based matching (-PRD-)', () => {
      test('detects hoop exec on unknown PRD connection via -PRD- pattern', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-NEW-SERVICE-PRD-RO -f /tmp/query.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-NEW-SERVICE-PRD-RO')
      })

      test('detects -PRD- pattern case-insensitively', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec some-service-prd-ro -f /tmp/q.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, [])
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('SOME-SERVICE-PRD-RO')
      })
    })

    describe('no violation scenarios', () => {
      test('returns no violation for hoop exec on HOM connection', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-CONSORTIUM-HOM-RO -f /tmp/query.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for hoop exec on QA connection', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-INSURANCE-QA-RO -f /tmp/query.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for hoop exec on DEV connection', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-INSURANCE-DEV-RW -f /tmp/query.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for runbook API REST calls (curl)', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'curl -sk -X POST "${API_URL}/api/runbooks/exec" -H "Authorization: Bearer ${TOKEN}" -d \'{"connection_name": "ATLAS-MGO-CONSORTIUM-PRD-RO"}\'',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for non-hoop commands', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'ls -la /tmp/',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for empty message history', () => {
        const result = detectPrdExecViolation([], prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for user messages (not assistant)', () => {
        const history = [
          {
            role: 'user',
            content: [
              {
                type: 'tool-call',
                toolName: 'run_terminal_command',
                input: { command: 'hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/q.tmp' },
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation for non-run_terminal_command tool calls', () => {
        const history = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'read_files',
                input: { paths: ['hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO'] },
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation when command mentions PRD but is not hoop exec', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'echo "Connection ATLAS-MGO-CONSORTIUM-PRD-RO is disabled for exec"',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('does not false-positive when PRD name appears in echo but exec targets HOM', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'echo "Switching from ATLAS-MGO-CONSORTIUM-PRD-RO to HOM" && hoop exec ATLAS-MGO-CONSORTIUM-HOM-RO -f /tmp/q.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('does not false-positive when PRD name is in a variable assignment before hoop exec on HOM', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'CONN=ATLAS-MGO-CONSORTIUM-PRD-RO && hoop exec ATLAS-MGO-CONSORTIUM-HOM-RO -f /tmp/q.tmp',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })

      test('returns no violation with empty prdNames and non-PRD connection', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-CONSORTIUM-HOM-RO -f /tmp/q.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, [])
        expect(result.detected).toBe(false)
        expect(result.connectionName).toBe('')
      })
    })

    describe('message history windowing', () => {
      test('only inspects the last 4 messages', () => {
        const oldViolation = createAssistantMessage([
          {
            toolName: 'run_terminal_command',
            command: 'hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/q.tmp < /dev/null',
          },
        ])
        const fillerMessages = Array.from({ length: 4 }, () => ({
          role: 'user',
          content: [{ type: 'text', text: 'filler' }],
        }))

        const history = [oldViolation, ...fillerMessages]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('detects violation in the last 4 messages', () => {
        const fillerMessages = Array.from({ length: 2 }, () => ({
          role: 'user',
          content: [{ type: 'text', text: 'filler' }],
        }))
        const violation = createAssistantMessage([
          {
            toolName: 'run_terminal_command',
            command: 'hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/q.tmp < /dev/null',
          },
        ])

        const history = [...fillerMessages, violation, { role: 'user', content: [{ type: 'text', text: 'ok' }] }]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
      })
    })

    describe('edge cases', () => {
      test('handles messages with no content array', () => {
        const history = [{ role: 'assistant' }]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('handles messages with null content', () => {
        const history = [{ role: 'assistant', content: null }]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('handles tool calls with missing input', () => {
        const history = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'run_terminal_command',
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('handles tool calls with missing command in input', () => {
        const history = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'run_terminal_command',
                input: {},
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('handles hoop exec with extra whitespace', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop   exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/q.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-CONSORTIUM-PRD-RO')
      })

      test('handles multiple tool calls in single message — detects first violation', () => {
        const history = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tc1',
                toolName: 'run_terminal_command',
                input: { command: 'hoop exec ATLAS-MGO-CONSORTIUM-HOM-RO -f /tmp/q.tmp < /dev/null' },
              },
              {
                type: 'tool-call',
                toolCallId: 'tc2',
                toolName: 'run_terminal_command',
                input: { command: 'hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO -f /tmp/q.tmp < /dev/null' },
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-CONSORTIUM-PRD-RO')
      })

      test('handles mixed content types (text + tool-call)', () => {
        const history = [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me query the database...' },
              {
                type: 'tool-call',
                toolCallId: 'tc1',
                toolName: 'run_terminal_command',
                input: { command: 'hoop exec ATLAS-MGO-INSURANCE-PRD-RW -f /tmp/q.tmp < /dev/null' },
              },
            ],
          },
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-INSURANCE-PRD-RW')
      })

      test('does not false-positive on hoop exec substring (e.g. hoop execute)', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'echo "hoop execute is not a real command"',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(false)
      })

      test('handles --auto-approve flag in command', () => {
        const history = [
          createAssistantMessage([
            {
              toolName: 'run_terminal_command',
              command: 'hoop exec ATLAS-MGO-CONSORTIUM-PRD-RO --auto-approve -f /tmp/q.tmp < /dev/null',
            },
          ]),
        ]

        const result = detectPrdExecViolation(history, prdNames)
        expect(result.detected).toBe(true)
        expect(result.connectionName).toBe('ATLAS-MGO-CONSORTIUM-PRD-RO')
      })
    })
  })

  describe('getResolvedPrdRunbookPaths', () => {
    test('returns empty array when env is not PRD', () => {
      expect(getResolvedPrdRunbookPaths(['consortium'], 'HOM')).toEqual([])
      expect(getResolvedPrdRunbookPaths(['consortium'], 'QA')).toEqual([])
      expect(getResolvedPrdRunbookPaths(['consortium'], 'DEV')).toEqual([])
      expect(getResolvedPrdRunbookPaths(['consortium'], null)).toEqual([])
    })

    test('returns matching path for consortium keyword in PRD', () => {
      const result = getResolvedPrdRunbookPaths(['consortium'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('returns matching path for consorcio keyword in PRD', () => {
      const result = getResolvedPrdRunbookPaths(['consorcio'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('returns matching path for consorcios keyword in PRD', () => {
      const result = getResolvedPrdRunbookPaths(['consorcios'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('returns matching path for consortia keyword in PRD', () => {
      const result = getResolvedPrdRunbookPaths(['consortia'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('returns empty array for unrelated keywords in PRD', () => {
      const result = getResolvedPrdRunbookPaths(['payment', 'orders', 'users'], 'PRD')
      expect(result).toEqual([])
    })

    test('deduplicates paths when multiple keywords map to same path', () => {
      const result = getResolvedPrdRunbookPaths(['consortium', 'consorcio', 'consortia'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('returns empty array for empty keywords', () => {
      const result = getResolvedPrdRunbookPaths([], 'PRD')
      expect(result).toEqual([])
    })

    test('works with mixed relevant and irrelevant keywords', () => {
      const result = getResolvedPrdRunbookPaths(['payment', 'consortium', 'users'], 'PRD')
      expect(result).toEqual(['insurance/atlas-mgo-consortium-prd'])
    })

    test('accepts custom path mapping', () => {
      const customMapping = {
        myservice: 'custom/path/to/myservice',
        another: 'another/path',
      }
      const result = getResolvedPrdRunbookPaths(['myservice'], 'PRD', customMapping)
      expect(result).toEqual(['custom/path/to/myservice'])
    })
  })

  describe('PRD_RUNBOOK_PATHS', () => {
    test('maps consortium keywords to insurance/atlas-mgo-consortium-prd', () => {
      expect(PRD_RUNBOOK_PATHS['consortium']).toBe('insurance/atlas-mgo-consortium-prd')
      expect(PRD_RUNBOOK_PATHS['consorcio']).toBe('insurance/atlas-mgo-consortium-prd')
      expect(PRD_RUNBOOK_PATHS['consorcios']).toBe('insurance/atlas-mgo-consortium-prd')
      expect(PRD_RUNBOOK_PATHS['consortia']).toBe('insurance/atlas-mgo-consortium-prd')
    })

    test('does not have mappings for non-consortium keywords', () => {
      expect(PRD_RUNBOOK_PATHS['insurance']).toBeUndefined()
      expect(PRD_RUNBOOK_PATHS['payment']).toBeUndefined()
    })
  })

  describe('prioritizeRunbooksByPrdPaths', () => {
    const runbooks = [
      { name: 'other/some-runbook.runbook.js' },
      { name: 'insurance/atlas-mgo-consortium-prd/find-by-id.runbook.js' },
      { name: 'unrelated/query.runbook.js' },
      { name: 'insurance/atlas-mgo-consortium-prd/count-documents.runbook.js' },
      { name: 'insurance/atlas-mgo-insurance-prd/another.runbook.js' },
    ]

    test('puts matching runbooks first when resolvedPaths is provided', () => {
      const result = prioritizeRunbooksByPrdPaths(runbooks, ['insurance/atlas-mgo-consortium-prd'])

      // First two should be the consortium-prd runbooks
      expect(result[0].name).toBe('insurance/atlas-mgo-consortium-prd/find-by-id.runbook.js')
      expect(result[1].name).toBe('insurance/atlas-mgo-consortium-prd/count-documents.runbook.js')

      // Rest should be the non-matching ones
      expect(result.length).toBe(5)
      const nonMatching = result.slice(2)
      expect(nonMatching.every((r) => !r.name.startsWith('insurance/atlas-mgo-consortium-prd'))).toBe(true)
    })

    test('returns runbooks unchanged when resolvedPaths is empty', () => {
      const result = prioritizeRunbooksByPrdPaths(runbooks, [])
      expect(result).toEqual(runbooks)
    })

    test('does not modify the original array', () => {
      const original = [...runbooks]
      prioritizeRunbooksByPrdPaths(runbooks, ['insurance/atlas-mgo-consortium-prd'])
      expect(runbooks).toEqual(original)
    })

    test('handles empty runbooks array', () => {
      const result = prioritizeRunbooksByPrdPaths([], ['insurance/atlas-mgo-consortium-prd'])
      expect(result).toEqual([])
    })

    test('handles case-insensitive path matching', () => {
      const mixedCaseRunbooks = [
        { name: 'other/runbook.js' },
        { name: 'Insurance/Atlas-MGO-Consortium-PRD/query.runbook.js' },
      ]
      const result = prioritizeRunbooksByPrdPaths(mixedCaseRunbooks, ['insurance/atlas-mgo-consortium-prd'])
      expect(result[0].name).toBe('Insurance/Atlas-MGO-Consortium-PRD/query.runbook.js')
    })

    test('handles multiple resolved paths', () => {
      const multiRunbooks = [
        { name: 'unrelated/runbook.js' },
        { name: 'insurance/atlas-mgo-consortium-prd/find.runbook.js' },
        { name: 'insurance/atlas-mgo-insurance-prd/query.runbook.js' },
      ]
      const result = prioritizeRunbooksByPrdPaths(multiRunbooks, [
        'insurance/atlas-mgo-consortium-prd',
        'insurance/atlas-mgo-insurance-prd',
      ])

      // Both matching runbooks should come before the unrelated one
      expect(result[2].name).toBe('unrelated/runbook.js')
      expect(result.length).toBe(3)
    })

    test('preserves relative order of non-matching runbooks', () => {
      const orderedRunbooks = [
        { name: 'aaa/first.runbook.js' },
        { name: 'insurance/atlas-mgo-consortium-prd/match.runbook.js' },
        { name: 'zzz/last.runbook.js' },
      ]
      const result = prioritizeRunbooksByPrdPaths(orderedRunbooks, ['insurance/atlas-mgo-consortium-prd'])

      expect(result[0].name).toBe('insurance/atlas-mgo-consortium-prd/match.runbook.js')
      // Non-matching ones should follow (order among them preserved by stable sort)
      const nonMatching = result.slice(1)
      expect(nonMatching[0].name).toBe('aaa/first.runbook.js')
      expect(nonMatching[1].name).toBe('zzz/last.runbook.js')
    })

    test('all runbooks match resolved path', () => {
      const allMatching = [
        { name: 'insurance/atlas-mgo-consortium-prd/a.runbook.js' },
        { name: 'insurance/atlas-mgo-consortium-prd/b.runbook.js' },
      ]
      const result = prioritizeRunbooksByPrdPaths(allMatching, ['insurance/atlas-mgo-consortium-prd'])
      expect(result).toEqual(allMatching)
    })

    test('no runbooks match resolved path', () => {
      const noMatching = [
        { name: 'other/a.runbook.js' },
        { name: 'another/b.runbook.js' },
      ]
      const result = prioritizeRunbooksByPrdPaths(noMatching, ['insurance/atlas-mgo-consortium-prd'])
      expect(result).toEqual(noMatching)
    })
  })
})
