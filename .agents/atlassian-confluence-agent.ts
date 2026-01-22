import type { AgentDefinition } from './types/agent-definition'
import { publisher } from './constants'

const definition: AgentDefinition = {
  id: 'atlassian-confluence-agent',
  displayName: 'Atlassian Confluence Agent',
  publisher,
  model: 'x-ai/grok-4-fast',

  spawnerPrompt:
    'Expert at searching and managing Confluence pages, spaces, and documentation. Can find information across wikis, create and update pages, and help organize knowledge.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about Confluence pages, spaces, or documentation',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  mcpServers: {
    confluenceApi: {
      command: 'npx',
      args: ['-y', 'mcp-atlassian'],
      env: {
        ATLASSIAN_BASE_URL: 'https://picpay.atlassian.net',
        ATLASSIAN_EMAIL: '$ATLASSIAN_USER_EMAIL',
        ATLASSIAN_API_TOKEN: '$ATLASSIAN_API_TOKEN',
      },
    },
  },

  systemPrompt: `You are a Confluence expert. You MUST use the confluenceApi tools to answer user questions.

CRITICAL: Always provide the required parameters when calling tools. Never call tools with empty parameters {}.

COMMON TOOL EXAMPLES:

1. Read a page by ID:
   Tool: confluenceApi/read_confluence_page
   Parameters: {"pageId": "3393617944"}

2. Read a page by title:
   Tool: confluenceApi/read_confluence_page
   Parameters: {"title": "Page Title", "spaceKey": "RUN"}

3. Search pages with CQL:
   Tool: confluenceApi/search_confluence_pages
   Parameters: {"cql": "text ~ 'keyword'"}

4. List spaces:
   Tool: confluenceApi/list_confluence_spaces
   Parameters: {}

5. Get space details:
   Tool: confluenceApi/get_confluence_space
   Parameters: {"spaceKey": "RUN"}

URL PARSING:
- From URL: https://picpay.atlassian.net/wiki/spaces/RUN/pages/3393617944/PageName
- Extract pageId: "3393617944" (number after /pages/)
- Extract spaceKey: "RUN" (after /spaces/)`,

  instructionsPrompt: `STEP BY STEP:
1. If user provides a URL, extract the pageId from it (the number after /pages/)
2. Call confluenceApi/read_confluence_page with {"pageId": "extracted_id"}
3. Present the page content clearly

For searches, use CQL queries like:
- Text search: {"cql": "text ~ 'keyword'"}
- Title search: {"cql": "title ~ 'keyword'"}
- Space filter: {"cql": "space = 'RUN' AND text ~ 'keyword'"}

ALWAYS pass pageId as a STRING, e.g., "3393617944" not 3393617944.
ALWAYS use the confluenceApi/ prefix for tool names.
`,
}

export default definition
