import type { AgentDefinition } from './types/agent-definition'

/**
 * SonarQube API Agent
 *
 * This agent provides access to SonarQube/SonarCloud code quality and security analysis
 * via direct REST API calls using curl. It's more reliable than the MCP version.
 *
 * Requirements:
 * - Environment file at ~/.mcp-sonarqube.env with your SonarQube credentials
 * - SonarQube instance (SonarCloud or self-hosted SonarQube Server)
 * - SonarQube authentication token (generate in SonarQube under My Account > Security)
 *
 * Environment File Setup:
 * Create a file at ~/.mcp-sonarqube.env with:
 *   SONARQUBE_TOKEN=your-token-here
 *   SONARQUBE_ORG=your-organization (for SonarCloud)
 *
 * Example usage:
 * - "Show me critical security vulnerabilities in project my-app"
 * - "What are the code quality issues in pull request #1?"
 * - "Get code coverage metrics for project XYZ"
 * - "List all security hotspots with high probability"
 * - "Check the quality gate status for this project"
 *
 * URL Support:
 * You can also provide a SonarCloud URL directly:
 * - "https://sonarcloud.io/summary/new_code?id=PicPay_ms-consortium-recurrence&pullRequest=1"
 */

const agent: AgentDefinition = {
  id: 'sonarqube-api',
  displayName: 'SonarQube API Agent',
  publisher: 'codebuff',

  model: 'anthropic/claude-sonnet-4-20250514',

  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
  ],

  spawnableAgents: [
    'thinker',
    'file-picker',
    'researcher-web',
    'code-reviewer',
    'editor',
    'commander',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What you want to analyze or query in SonarQube. Examples: check code quality, find security issues, get coverage metrics, review quality gate status.',
    },
  },

  spawnerPrompt:
    'Spawn this agent when you need to analyze code quality, security vulnerabilities, or metrics from SonarQube/SonarCloud. ' +
    'It uses direct REST API calls via curl, which is more reliable than the MCP version. ' +
    'It can query issues, security hotspots, code coverage, technical debt, and quality gates.',

  systemPrompt:
    'You are an expert SonarQube assistant with access to code quality and security analysis through the SonarCloud REST API. ' +
    'You can help users analyze code quality, identify bugs and vulnerabilities, review security hotspots, check code coverage, ' +
    'and assess quality gate status. You understand severity levels, issue types (bugs, vulnerabilities, code smells), ' +
    'and can provide actionable insights for improving code quality and security.\n\n' +
    'You have access to the SonarCloud API via curl commands. The credentials are stored in ~/.mcp-sonarqube.env:\n' +
    '- SONARQUBE_TOKEN: The authentication token\n' +
    '- SONARQUBE_ORG: The organization name (e.g., PicPay)\n\n' +
    'Always use the token for authentication with curl: curl -u "$TOKEN:" ...',

  instructionsPrompt:
    "Use curl commands to query the SonarCloud REST API and complete the user's request.\n\n" +
    '**Authentication:**\n' +
    '```bash\n' +
    'TOKEN=$(grep SONARQUBE_TOKEN ~/.mcp-sonarqube.env | cut -d= -f2)\n' +
    'curl -s -u "$TOKEN:" "https://sonarcloud.io/api/..."\n' +
    '```\n\n' +
    '**Main API Endpoints:**\n\n' +
    '1. **Issues** - Get bugs, vulnerabilities, code smells:\n' +
    '   `GET /api/issues/search?projects=PROJECT_KEY&pullRequest=PR_NUMBER`\n' +
    '   - Filter by: severities (BLOCKER,CRITICAL,MAJOR,MINOR,INFO)\n' +
    '   - Filter by: types (BUG,VULNERABILITY,CODE_SMELL)\n' +
    '   - Filter by: statuses (OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED)\n\n' +
    '2. **Security Hotspots** - Get security hotspots:\n' +
    '   `GET /api/hotspots/search?project=PROJECT_KEY&pullRequest=PR_NUMBER`\n\n' +
    '3. **Measures** - Get metrics (coverage, duplications, etc.):\n' +
    '   `GET /api/measures/component?component=PROJECT_KEY&metricKeys=coverage,bugs,vulnerabilities`\n' +
    '   - For PR: add `&pullRequest=PR_NUMBER`\n\n' +
    '4. **Quality Gate** - Get quality gate status:\n' +
    '   `GET /api/qualitygates/project_status?projectKey=PROJECT_KEY`\n' +
    '   - For PR: add `&pullRequest=PR_NUMBER`\n\n' +
    '5. **Pull Request** - Get PR analysis details:\n' +
    '   `GET /api/project_pull_requests/list?project=PROJECT_KEY`\n\n' +
    '**Example Queries:**\n\n' +
    '```bash\n' +
    '# Get all issues for a PR\n' +
    'TOKEN=$(grep SONARQUBE_TOKEN ~/.mcp-sonarqube.env | cut -d= -f2)\n' +
    'curl -s -u "$TOKEN:" "https://sonarcloud.io/api/issues/search?projects=PicPay_ms-consortium-recurrence&pullRequest=1" | jq .\n\n' +
    '# Get critical/blocker issues only\n' +
    'curl -s -u "$TOKEN:" "https://sonarcloud.io/api/issues/search?projects=PicPay_ms-consortium-recurrence&pullRequest=1&severities=BLOCKER,CRITICAL" | jq .\n\n' +
    '# Get quality gate status\n' +
    'curl -s -u "$TOKEN:" "https://sonarcloud.io/api/qualitygates/project_status?projectKey=PicPay_ms-consortium-recurrence&pullRequest=1" | jq .\n\n' +
    '# Get coverage and metrics\n' +
    'curl -s -u "$TOKEN:" "https://sonarcloud.io/api/measures/component?component=PicPay_ms-consortium-recurrence&pullRequest=1&metricKeys=coverage,bugs,vulnerabilities,code_smells,security_hotspots" | jq .\n' +
    '```\n\n' +
    '**Best Practices:**\n' +
    '- Always use `jq` to format JSON output for readability\n' +
    '- Parse the URL if the user provides a SonarCloud link to extract project key and PR number\n' +
    '- Group issues by severity and type when presenting results\n' +
    '- Provide actionable recommendations for fixing issues\n' +
    '- Explain the impact of each issue type',

  handleSteps: function* ({ agentState, prompt, logger }) {
    logger.info('Starting SonarQube API agent')

    // Check if the prompt contains a SonarCloud URL
    const sonarCloudUrlRegex = /https:\/\/sonarcloud\.io\/[^?]*\?id=([^&]+)(?:&pullRequest=(\d+))?/
    const match = prompt?.match(sonarCloudUrlRegex)

    if (match) {
      const projectId = match[1]
      const pullRequestNumber = match[2]

      logger.info(`Detected SonarCloud URL - Project ID: ${projectId}, PR: ${pullRequestNumber || 'N/A'}`)

      // Add context to help the agent use the correct parameters
      const contextMessage = pullRequestNumber
        ? `I've detected a SonarCloud URL. I'll analyze pull request #${pullRequestNumber} for project '${projectId}' using the SonarCloud REST API.`
        : `I've detected a SonarCloud URL. I'll analyze project '${projectId}' using the SonarCloud REST API.`

      agentState.messageHistory.push({
        role: 'assistant',
        content: [{ type: 'text', text: contextMessage }],
      })
    }

    // Let the agent decide what tools to use
    yield 'STEP_ALL'

    logger.info('SonarQube API analysis complete')
  },
}

export default agent
