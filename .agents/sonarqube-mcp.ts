import type { AgentDefinition } from './types/agent-definition'

/**
 * SonarQube MCP Agent
 *
 * This agent provides access to SonarQube code quality and security analysis via the MCP SonarQube server.
 * It allows you to query code quality metrics, issues, security vulnerabilities, and hotspots through natural language.
 *
 * Requirements:
 * - Docker must be installed and running
 * - Environment file at ~/.mcp-sonarqube.env with your SonarQube credentials
 * - SonarQube instance (SonarCloud or self-hosted SonarQube Server)
 * - SonarQube authentication token (generate in SonarQube under My Account > Security)
 *
 * Environment File Setup:
 * Create a file at ~/.mcp-sonarqube.env with the following content:
 *
 * For SonarQube Server (< 10.0) or SonarCloud:
 *   SONARQUBE_URL=https://your-sonarqube-instance.com
 *   SONARQUBE_USERNAME=your-token-here
 *   # Note: For SonarQube < 10.0, use token as username (no password needed)
 *
 * For SonarQube Server (>= 10.0):
 *   SONARQUBE_URL=https://your-sonarqube-instance.com
 *   SONARQUBE_TOKEN=your-token-here
 *
 * For SonarCloud with Organization:
 *   SONARQUBE_URL=https://sonarcloud.io/
 *   SONARQUBE_ORG=your-organization
 *   SONARQUBE_USERNAME=your-token-here
 *
 * Optional - Integration with SonarQube for IDE:
 * When using SonarQube for IDE (VS Code extension), add:
 *   SONARQUBE_IDE_PORT=64120-64130
 *
 * Note: On Linux with Docker, you may need to add --network=host to the Docker args
 * to allow the container to connect to the SonarQube for IDE server running on localhost.
 *
 * Example usage:
 * - "Show me critical security vulnerabilities in project my-app"
 * - "What are the code quality issues in the main branch?"
 * - "Get code coverage metrics for project XYZ"
 * - "List all security hotspots with high probability"
 * - "Check the quality gate status for this project"
 *
 * URL Support:
 * You can also provide a SonarCloud URL directly, and the agent will automatically extract
 * the project ID and pull request number:
 * - "https://sonarcloud.io/summary/new_code?id=PicPay_ms-consortium-recurrence&pullRequest=1"
 * - "https://sonarcloud.io/project/overview?id=MyOrg_my-project"
 *
 * The agent will parse the URL and use the correct project key and PR number when querying SonarQube.
 */

const agent: AgentDefinition = {
  id: 'sonarqube-mcp',
  displayName: 'SonarQube MCP Agent',
  publisher: 'codebuff',

  model: 'x-ai/grok-code-fast-1',

  // Configure the MCP server connection
  // Using the community SonarQube MCP Server from https://github.com/sapientpants/sonarqube-mcp-server
  // This version is compatible with current SonarQube versions (10.x and SonarCloud)
  // You MUST create a file at ~/.mcp-sonarqube.env with your SonarQube credentials
  mcpServers: {
    sonarqube: {
      type: 'stdio',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '--env-file',
        '/Users/anderson.vieira/.mcp-sonarqube.env',
        'sapientpants/sonarqube-mcp-server:latest',
      ],
      env: {},
    },
  },

  // By default, all tools from the SonarQube MCP server are available.
  // Common tools from the server include:
  // - get_issues: Retrieve code quality issues (bugs, vulnerabilities, code smells)
  // - get_project_status: Fetch project metrics and quality gate status
  // - list_projects: List available projects in the SonarQube instance
  // - get_hotspots: Retrieve security hotspots
  toolNames: [
    // Core Codebuff tools
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    // All SonarQube MCP tools will be available automatically
  ],

  spawnableAgents: [
    'thinker',
    'file-picker',
    'researcher-web',
    'code-reviewer',
    'editor',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What you want to analyze or query in SonarQube. Examples: check code quality, find security issues, get coverage metrics, review quality gate status.',
    },
  },

  spawnerPrompt:
    'Spawn this agent when you need to analyze code quality, security vulnerabilities, or metrics from SonarQube. ' +
    'It can query issues, security hotspots, code coverage, technical debt, and quality gates. ' +
    'Requires SonarQube MCP Server installed and configured with instance URL and authentication token.',

  systemPrompt:
    'You are an expert SonarQube assistant with access to code quality and security analysis through the MCP SonarQube server. ' +
    'You can help users analyze code quality, identify bugs and vulnerabilities, review security hotspots, check code coverage, ' +
    'and assess quality gate status. You understand severity levels, issue types (bugs, vulnerabilities, code smells), ' +
    'and can provide actionable insights for improving code quality and security. ' +
    'When using SonarQube tools, be specific about project keys, branches, and filtering criteria.',

  instructionsPrompt:
    "Use the SonarQube MCP tools to complete the user's request. " +
    'Available operations typically include: \n' +
    '- **Issues Analysis**: Query and filter bugs, vulnerabilities, and code smells by severity, type, and status\n' +
    '- **Security Review**: Identify security hotspots, vulnerabilities, and their probability/severity\n' +
    '- **Quality Metrics**: Retrieve code coverage, duplication rates, technical debt, and other measures\n' +
    '- **Project Status**: Check quality gate status and overall project health\n' +
    '- **Component Navigation**: Browse project structure and analyze specific files or directories\n' +
    '- **Branch Analysis**: Compare quality metrics across different branches\n\n' +
    'Best practices:\n' +
    '- Always specify the project key when querying specific projects\n' +
    '- Filter by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO) to prioritize issues\n' +
    '- Use appropriate issue types (BUG, VULNERABILITY, CODE_SMELL, SECURITY_HOTSPOT)\n' +
    '- Provide context about the codebase when suggesting fixes\n' +
    '- Explain the impact and remediation steps for identified issues\n\n' +
    'If you need to discover available tools or their parameters, call them and examine the results.',

  // Let the agent use tools as needed
  handleSteps: function* ({ agentState, prompt, logger }) {
    logger.info('Starting SonarQube MCP agent')

    // Check if the prompt contains a SonarCloud URL
    const sonarCloudUrlRegex = /https:\/\/sonarcloud\.io\/[^?]*\?id=([^&]+)(?:&pullRequest=(\d+))?/
    const match = prompt.match(sonarCloudUrlRegex)

    if (match) {
      const projectId = match[1]
      const pullRequestNumber = match[2]

      logger.info(`Detected SonarCloud URL - Project ID: ${projectId}, PR: ${pullRequestNumber || 'N/A'}`)

      // Modify the agent state to include the extracted parameters
      const analysisContext = pullRequestNumber
        ? `Analyze the pull request #${pullRequestNumber} for project '${projectId}'.`
        : `Analyze the project '${projectId}'.`

      // Add context to help the agent use the correct parameters
      agentState.messages.push({
        role: 'assistant',
        content: `I've detected a SonarCloud URL. ${analysisContext} I'll query the SonarQube API with project key '${projectId}'${pullRequestNumber ? ` and pull request '${pullRequestNumber}'` : ''}.`,
      })
    }

    // Let the agent decide what tools to use based on the prompt
    yield 'STEP_ALL'

    logger.info('SonarQube analysis complete')
  },
}

export default agent
