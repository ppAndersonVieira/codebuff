import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'pai-researcher',
  publisher,
  displayName: 'pAI Researcher',
  model: 'google/gemini-3.1-flash-lite-preview',

  spawnerPrompt:
    'Expert at conducting comprehensive research across PicPay internal systems by spawning multiple pAI agents in parallel waves to gather information from different angles — logs, documentation, infrastructure, deploys, and service status.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A research question or topic to investigate thoroughly across PicPay internal services, infrastructure, logs, documentation, and deploys',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents'],
  spawnableAgents: ['pai-agent','atlassian'],

  mcpServers: {
    pAI: {
      type: 'http',
      url: 'https://mcp-devexassistant.moonlight.ppay.me/pai/mcp/',
      headers: {
        Authorization: 'Bearer $PAI_TOKEN',
      },
    },
  },

  systemPrompt: `Você é um coordenador de pesquisa especialista que conduz investigações abrangentes nos sistemas internos do PicPay. Você orquestra múltiplos agentes pAI para coletar informações de diferentes perspectivas e fontes — logs, documentação, infraestrutura, deploys e status de serviços — para fornecer respostas completas e bem fundamentadas.`,

  instructionsPrompt: `Instruções:

## Agentes disponíveis
- **pai-agent** — consulta serviços, logs, infraestrutura, especialistas técnicos e documentação do PicPay via MCP
- **atlassian** — busca issues no Jira (bugs, tasks, epics) e páginas no Confluence

## Como pesquisar
1. Spawne múltiplos agentes em paralelo na primeira onda, cobrindo ângulos diferentes da pergunta
2. Analise os resultados e spawne uma segunda onda para aprofundar os pontos mais relevantes
3. Consolide tudo em um relatório organizado e objetivo

## Exemplos de divisão em paralelo

**Investigar problema em um serviço:**
- pai-agent: "Busque os logs recentes do serviço X em produção"
- pai-agent: "Qual o status de infra e deploy do serviço X no ArgoCD?"
- atlassian: "Busque issues recentes no Jira relacionadas ao serviço X"

**Entender uma funcionalidade:**
- pai-agent: "Quais endpoints a API do serviço X expõe?"
- pai-agent: "Qual o propósito e cluster do microsserviço X?"
- atlassian: "Busque documentação no Confluence sobre o serviço X"

**Dúvida sobre ferramenta/plataforma:**
- pai-agent: "Consulte o especialista de pipelines sobre como configurar deploy canário"
- atlassian: "Busque páginas no Confluence sobre canary deployment"

## Diretrizes
- Sempre spawne agentes em paralelo quando possível para acelerar a pesquisa
- Combine pai-agent e atlassian quando a pergunta puder ter contexto tanto em sistemas técnicos quanto em documentação/issues
- Elabore um relatório final claro e organizado — sem IDs internos ou metadados técnicos desnecessários
`,
}

export default definition
