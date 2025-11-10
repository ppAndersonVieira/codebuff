import { publisher } from './constants'
import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const picpayConsortiumExpertAgent: AgentDefinition = {
  id: 'picpay-consortium-expert',
  publisher,
  displayName: 'PicPay Consortium Expert',
  model: 'openai/gpt-5',
  spawnerPrompt:
    'Expert agent in PicPay consortium architecture. Analyzes multiple consortium repositories, updating them to the main branch before analysis. Can assist with implementations, improvements, features, and bug fixes related to the consortium ecosystem.',
  toolNames: [
    'spawn_agents',
    'read_files',
    'read_subtree',
    'write_todos',
    'str_replace',
    'write_file',
    'end_turn',
  ],
  spawnableAgents: [
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'commander',
    'read-only-commander',
    'researcher-web',
    'researcher-docs',
    'file-explorer',
    'editor-best-of-n',
    'thinker-best-of-n',
    'code-reviewer',
    'validator',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'User request related to consortium architecture',
    },
  },
  systemPrompt: `You are an expert agent in PicPay's consortium architecture.

# Consortium Repositories

You have access to the following consortium repositories:
1. **ms-consortium** - /Users/anderson.vieira/Documents/repositorios/ms-consortium
2. **ms-consortium-integration** - /Users/anderson.vieira/Documents/repositorios/ms-consortium-integration
3. **ms-consortium-payment-engine** - /Users/anderson.vieira/Documents/repositorios/ms-consortium-payment-engine
4. **ms-consortium-orchestrator** - /Users/anderson.vieira/Documents/repositorios/ms-consortium-orchestrator
5. **ms-consortium-recurrence** - /Users/anderson.vieira/Documents/repositorios/ms-consortium-recurrence

# Responsibilities

You are responsible for:
- Analyzing PicPay's consortium architecture across the 5 repositories
- Updating repositories to the main branch before any analysis
- Assisting with implementations, improvements, features, and bug fixes
- Providing complete context about the architecture and system operation
- Ensuring changes are consistent across microservices

# Workflow

1. **Repository Updates**: Whenever starting an analysis, first update all relevant repositories:
   - Execute 'git checkout main' in each repository
   - Execute 'git pull' to get the latest changes
   
2. **Contextual Analysis**: 
   - Use file-picker and code-searcher to find relevant files
   - Read directory structure to understand organization
   - Analyze dependencies and integrations between microservices
   
3. **Implementation**:
   - Use thinker-best-of-n for complex problems
   - Use editor-best-of-n to implement code changes
   - Use code-reviewer to validate changes
   - Use validator to ensure tests pass

# Mandates

- **Always update repositories first**: Before any analysis, ensure you're working with updated code
- **Holistic analysis**: Consider impacts on all related microservices
- **Documentation**: Explain architectural decisions and identified patterns
- **Quality**: Prioritize clean, testable, and maintainable code
- **Consistency**: Maintain consistent patterns across microservices`,

  instructionsPrompt: `As PicPay Consortium Expert, follow this workflow:

1. **Update**: First, update all repositories to the main branch
2. **Exploration**: Use file-pickers and code-searchers to find relevant files
3. **Analysis**: Use thinker-best-of-n to think deeply about the request
4. **Implementation**: If necessary, use editor-best-of-n to implement changes
5. **Review**: Use code-reviewer to validate changes
6. **Validation**: Use validator to ensure everything works

Always consider the impact on all related microservices.`,

  handleSteps: function* ({ prompt }: AgentStepContext) {
    const userRequest = prompt || ''

    // Step 1: Update all repositories to main branch
    yield {
      type: 'STEP_TEXT',
      text: '🔄 Updating consortium repositories to main branch...\n',
    }

    const repositories = [
      '/Users/anderson.vieira/Documents/repositorios/ms-consortium',
      '/Users/anderson.vieira/Documents/repositorios/ms-consortium-integration',
      '/Users/anderson.vieira/Documents/repositorios/ms-consortium-payment-engine',
      '/Users/anderson.vieira/Documents/repositorios/ms-consortium-orchestrator',
      '/Users/anderson.vieira/Documents/repositorios/ms-consortium-recurrence',
    ]

    // Spawn commanders to update each repository in parallel
    yield {
      toolName: 'spawn_agents',
      input: {
        agents: repositories.map((repo) => ({
          agent_type: 'commander',
          prompt: `Execute git checkout main and git pull in the repository. Report if there were updates.`,
          params: {
            command: `cd ${repo} && git checkout main && git pull`,
            timeout_seconds: 60,
          },
        })),
      },
    }

    yield 'STEP'

    yield {
      type: 'STEP_TEXT',
      text: '✅ Repositories updated\n\n',
    }

    // Step 2: Analyze user request
    yield {
      type: 'STEP_TEXT',
      text: '🔍 Analyzing request and exploring relevant repositories...\n',
    }

    // Spawn file-picker to find relevant files
    yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'file-picker',
            prompt: userRequest,
          },
        ],
      },
    }

    yield 'STEP'

    // Step 3: Think deeply about the request
    yield {
      type: 'STEP_TEXT',
      text: '🧠 Analyzing architecture and planning approach...\n',
    }

    yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'thinker-best-of-n',
            prompt: `Analyze the user request in the context of PicPay's consortium architecture. Consider:
          
1. Which microservices are impacted?
2. What are the architectural implications?
3. Are there dependencies between services?
4. What is the best approach to implement?
5. What are the risks and considerations?

Request: ${userRequest}`,
            params: { n: 5 },
          },
        ],
      },
    }

    yield 'STEP'

    // Passo 4: Implementar mudanças se necessário
    const needsImplementation =
      userRequest.toLowerCase().includes('implementar') ||
      userRequest.toLowerCase().includes('criar') ||
      userRequest.toLowerCase().includes('adicionar') ||
      userRequest.toLowerCase().includes('corrigir') ||
      userRequest.toLowerCase().includes('fix')

    if (needsImplementation) {
      yield {
        type: 'STEP_TEXT',
        text: '⚙️ Implementing changes...\n',
      }

      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'editor-best-of-n',
              params: { n: 5 },
            },
          ],
        },
      }

      yield 'STEP'

      // Step 5: Review changes
      yield {
        type: 'STEP_TEXT',
        text: '🔎 Reviewing implemented changes...\n',
      }

      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'code-reviewer',
              prompt:
                'Review implemented changes in the context of consortium architecture',
            },
          ],
        },
      }

      yield 'STEP'

      // Step 6: Validate
      yield {
        type: 'STEP_TEXT',
        text: '✓ Validating implementation...\n',
      }

      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'validator',
              prompt: 'Validate changes in affected consortium repositories',
            },
          ],
        },
      }

      yield 'STEP'
    }

    yield {
      type: 'STEP_TEXT',
      text: '\n✅ Analysis completed!',
    }
  },
}

export default picpayConsortiumExpertAgent
