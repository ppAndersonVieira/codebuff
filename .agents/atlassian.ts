import type { AgentDefinition } from './types/agent-definition'

/**
 * Atlassian MCP Agent
 *
 * This agent provides access to Atlassian (Jira, Confluence) via the MCP Atlassian server.
 * It runs the mcp-atlassian Docker container and allows you to interact with your
 * Atlassian workspace through natural language.
 *
 * Requirements:
 * - Docker must be installed and running
 * - Environment file at ~/.mcp-atlassian.env with your Atlassian credentials
 *
 * Example usage:
 * - "Search for issues assigned to me in Jira"
 * - "Create a new issue in project ABC"
 * - "Find Confluence pages about authentication"
 * - "Update issue ABC-123 status to In Progress"
 */

const agent: AgentDefinition = {
  id: 'atlassian-mcp',
  displayName: 'Atlassian MCP Agent',
  publisher: 'codebuff',

  model: 'x-ai/grok-code-fast-1',

  // Configure the MCP server connection
  mcpServers: {
    atlassian: {
      type: 'stdio',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '--env-file',
        '/Users/anderson.vieira/.mcp-atlassian.env',
        'ghcr.io/sooperset/mcp-atlassian:latest',
      ],
      env: {},
    },
  },

  // By default, all tools from the atlassian MCP server are available.
  // To limit specific tools, list them as: 'atlassian/tool-name'
  toolNames: [
    // Core Codebuff tools
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    // All Atlassian MCP tools will be available automatically
    // You can optionally specify specific tools like:
    // 'atlassian/search-jira',
    // 'atlassian/create-issue',
    // 'atlassian/update-issue',
    // etc.
  ],

  spawnableAgents: [
    'thinker',
    'file-picker',
    'researcher-web',
    'code-reviewer',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What you want to do with Atlassian (Jira/Confluence). Examples: search issues, create tickets, update status, find documentation.',
    },
  },

  spawnerPrompt:
    'Spawn this agent when you need to interact with Atlassian services (Jira, Confluence). ' +
    'It can search issues, create/update tickets, manage sprints, search Confluence pages, and more. ' +
    'Requires Docker and proper Atlassian credentials configured in ~/.mcp-atlassian.env.',

  systemPrompt:
    'You are an expert Atlassian assistant with access to Jira and Confluence through the MCP Atlassian server. ' +
    'You can help users manage their work items, search documentation, create issues, update statuses, and more. ' +
    'When using Atlassian tools, be specific about project keys, issue IDs, and search criteria.',

  instructionsPrompt:
    "Use the Atlassian MCP tools to complete the user's request. " +
    'Available operations typically include: \n' +
    '- Searching and filtering Jira issues\n' +
    '- Creating new issues with proper fields\n' +
    '- Updating issue status, assignees, and other fields\n' +
    '- Managing sprints and boards\n' +
    '- Searching Confluence pages and spaces\n' +
    '- Reading page content\n\n' +
    'Always confirm the results of create/update operations with the user. ' +
    'If you need to know what tools are available, you can call them and see the results.',

  // Let the agent use tools as needed
  handleSteps: function* ({ agentState, prompt, logger }) {
    logger.info('Starting Atlassian MCP agent')

    // Let the agent decide what tools to use based on the prompt
    yield 'STEP_ALL'

    logger.info('Atlassian operations complete')
  },
}

export default agent
