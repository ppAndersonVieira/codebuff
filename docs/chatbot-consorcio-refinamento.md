# Refinamento Técnico - Integração Chatbot Consórcio

## Contexto

O PicPay atuará como **provedor de LLM** para um parceiro terceiro que implementará um chatbot de consórcios. O chatbot será disponibilizado via WhatsApp/Telegram e **não terá acesso a sistemas internos do PicPay**, apenas consumirá o serviço de LLM.

### Caso de Uso: Carrinho Abandonado

**Objetivo:** Criar uma IA para dar suporte no carrinho abandonado de consórcio, visando conversão de vendas e esclarecimento de dúvidas dos clientes.

**Parceiros:**
- **MNV** - Consultor IA (chatbot)
- **Almai** - Provedor de IA
- **PicPay** - Provedor de LLM e dono da jornada do cliente

---

## Diagrama de Fluxo

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  PicPay App │    │   PicPay    │    │     MNV     │    │    Almai    │    │  WhatsApp   │
│  (Cliente)  │    │  (Backend)  │    │  (Chatbot)  │    │    (LLM)    │    │  (Canal)    │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │  1. Abandona     │                  │                  │                  │
       │     carrinho     │                  │                  │                  │
       │  (5min ou "X")   │                  │                  │                  │
       │─────────────────>│                  │                  │                  │
       │                  │                  │                  │                  │
       │                  │  2. Envia lead   │                  │                  │
       │                  │     via API      │                  │                  │
       │                  │─────────────────>│                  │                  │
       │                  │                  │                  │                  │
       │                  │                  │  3. Processa     │                  │
       │                  │                  │     com LLM      │                  │
       │                  │                  │─────────────────>│                  │
       │                  │                  │                  │                  │
       │                  │                  │  4. Envia msg    │                  │
       │                  │                  │     WhatsApp     │                  │
       │                  │                  │─────────────────────────────────────>│
       │                  │                  │                  │                  │
       │                  │                  │                  │    5. Cliente    │
       │                  │                  │<─────────────────────────────────────│
       │                  │                  │      responde    │                  │
       │                  │                  │                  │                  │
       │                  │  6. Retorna lead │                  │                  │
       │                  │     encerrado    │                  │                  │
       │                  │<─────────────────│                  │                  │
       │                  │                  │                  │                  │
       │                  │  7. Databricks   │                  │                  │
       │                  │  Dashboard p/    │                  │                  │
       │                  │  Máquina Vendas  │                  │                  │
       │                  │                  │                  │                  │
```

---

## Definição de Lead (Critérios de Aceite)

**Inclui:**
- Clientes que abandonaram a jornada **após a tela de seleção de grupos**
- Abandono = fecharam a jornada clicando no "X"
- Tempo para considerar abandono: **5 minutos** ou clique no "X"

**Exclui:**
- Clientes que clicaram em "FALAR COM ATENDENTE" (já em contato com Ademicon)
- Clientes que concluíram a jornada de contratação com sucesso

---

## Dados Compartilhados com MNV (PII - ATENÇÃO LGPD!)

### Dados do Cliente
| Campo | Tipo | Sensibilidade |
|-------|------|---------------|
| Nome | String | 🔴 PII |
| Telefone | String | 🔴 PII |
| Idade | Number | 🟡 Sensível |
| Potencial | Enum (baixa/alta renda) | 🟡 Sensível |

### Dados da Simulação
| Campo | Tipo | Sensibilidade |
|-------|------|---------------|
| Segmento do consórcio | String | 🟢 Baixo |
| Valor do crédito simulado | Number | 🟡 Sensível |
| Valor da parcela simulada | Number | 🟡 Sensível |

### Dados do Grupo (se selecionado)
| Campo | Tipo | Sensibilidade |
|-------|------|---------------|
| Valor do crédito | Number | 🟡 Sensível |
| Valor da parcela | Number | 🟡 Sensível |
| Tipo de parcela | Enum (fixa/reduzida) | 🟢 Baixo |
| Valor da taxa administrativa | Number | 🟢 Baixo |
| Prazo total | Number | 🟢 Baixo |

### Dados de Erro (se aplicável)
| Campo | Tipo | Sensibilidade |
|-------|------|---------------|
| Falha de pagamento por limite/saldo | Boolean | 🟡 Sensível |
| Outros erros | String | 🟢 Baixo |

---

## Métricas de Sucesso (Dashboard MNV)

### Métricas Agregadas
- Número de contatos realizados
- Número de respostas
- Taxa de conversão sobre leads

### Métricas por Conversa
- Tempo da conversa
- Resumo da conversa
- Conversa na íntegra
- Principais dúvidas do cliente (Preço, prazo, confiança, taxa adm, contemplação)
- Cliente mudou de segmento comparado ao lead enviado?

### Objetivos da POC
- [ ] Vendas de consórcio
- [ ] Conversão em cima do Lead
- [ ] Transparência de dados:
  - Por que clientes chegam até o fim e não conseguem pagar?
  - Clientes desistem por não entender o que é consórcio?
  - Cliente tem clareza sobre detalhes do grupo?

---

## Dúvidas Já Levantadas pelo Negócio

> ⚠️ **Estas dúvidas precisam ser respondidas ANTES do refinamento técnico:**

- [ ] **Chat da IA expira?** Se o cliente demorar 3 dias para responder, por exemplo?
- [ ] **Qualquer horário envia mensagem?** Se o lead chegar 1h da manhã, envia imediatamente?
- [ ] **Qual o tempo máximo para a Máquina de Vendas receber o lead?**
- [ ] **O que acontece se o telefone do cliente não estiver atualizado no PicPay?**
- [ ] **Qual o fluxo se o cliente não responder à Máquina de Vendas?**

---

## 1. Autenticação e Autorização

### Dúvidas para o Upstream

- [ ] Qual método de autenticação será utilizado? (API Key, OAuth 2.0, mTLS, JWT?)
- [ ] Haverá necessidade de múltiplas credenciais (ambientes de dev/staging/prod)?
- [ ] Como será feita a rotação de credenciais? Qual a frequência esperada?
- [ ] O parceiro terá um único client-id ou múltiplos (por canal, por tenant)?
- [ ] Precisamos implementar scopes/permissões granulares para diferentes operações?
- [ ] Como será o processo de onboarding do parceiro (geração de credenciais)?
- [ ] Haverá IP allowlist ou outras restrições de rede?

### Preocupações

- Vazamento de credenciais pode expor o serviço de LLM a uso indevido
- Necessidade de auditoria de todas as chamadas por credencial
- Revogação imediata de credenciais em caso de comprometimento

---

## 2. Rate Limiting e Throttling

### Dúvidas para o Upstream

- [ ] Qual a volumetria esperada? (requests/segundo, requests/minuto, requests/dia)
- [ ] Há picos sazonais previstos? (campanhas, datas específicas)
- [ ] Qual o comportamento esperado quando o limite for atingido? (429, queue, degradação?)
- [ ] O parceiro precisa de diferentes tiers de rate limit?
- [ ] Haverá limites por endpoint/operação ou global?
- [ ] Precisamos de burst allowance para absorver picos momentâneos?

### Preocupações

- Requests de LLM são custosos - sem rate limit adequado, custos podem escalar rapidamente
- Necessidade de headers de rate limit nas respostas (X-RateLimit-*)
- Estratégia de backpressure para proteger o provedor de LLM upstream

---

## 3. Billing e Cobrança

### Dúvidas para o Upstream

- [ ] Qual será o modelo de cobrança? (por request, por token, por conversação, flat fee?)
- [ ] Como será medido o consumo? (input tokens, output tokens, ambos?)
- [ ] Haverá franquia mínima mensal?
- [ ] Como será o ciclo de faturamento? (mensal, sob demanda?)
- [ ] O parceiro terá acesso a dashboard de consumo em tempo real?
- [ ] Haverá alertas de consumo? (80%, 90%, 100% da cota?)
- [ ] O que acontece quando a cota é excedida? (bloqueio, cobrança adicional, degradação?)
- [ ] Precisamos de relatórios detalhados de billing? Qual granularidade?

### Preocupações

- Necessidade de metering preciso e auditável
- Disputas de billing por discrepância de contagem
- Modelo de precificação precisa ser sustentável considerando custo do LLM

---

## 4. SLAs e Disponibilidade

### Dúvidas para o Upstream

- [ ] Qual SLA de disponibilidade esperado? (99.9%, 99.95%, 99.99%?)
- [ ] Qual latência máxima aceitável? (P50, P95, P99)
- [ ] Haverá janela de manutenção programada? Como será comunicada?
- [ ] Qual o processo de comunicação de incidentes?
- [ ] Haverá penalidades por descumprimento de SLA? Quais?
- [ ] O parceiro precisa de status page? Webhook de status?
- [ ] Qual o RTO/RPO esperado em caso de disaster recovery?

### Preocupações

- SLA do nosso provedor depende do SLA do LLM upstream (cadeia de dependência)
- Necessidade de monitoramento ativo para cumprir SLAs
- Definição clara de o que conta como "indisponibilidade" (total vs parcial)

---

## 5. Monitoramento e Observabilidade

### Dúvidas para o Upstream

- [ ] O parceiro precisa de acesso a métricas/dashboards?
- [ ] Quais métricas são importantes para o parceiro? (latência, erros, throughput?)
- [ ] Haverá integração com ferramentas de observabilidade do parceiro?
- [ ] Como serão tratados os logs? Qual retenção necessária?
- [ ] O parceiro quer receber alertas proativos? Por qual canal?
- [ ] Precisamos de distributed tracing cross-company?
- [ ] Haverá request-id/correlation-id para rastreabilidade?

### Preocupações

- Logs podem conter dados sensíveis de usuários finais (PII)
- Custo de armazenamento de logs de conversação completa
- Necessidade de sanitização antes de logar

---

## 6. Segurança e LGPD

### Dúvidas para o Upstream

- [ ] Quais dados pessoais trafegam nas requisições? (nome, CPF, dados financeiros?)
  - **Já identificado:** Nome, Telefone, Idade, Potencial de renda, dados de simulação
- [ ] O parceiro é o controlador dos dados ou nós somos co-controladores?
- [ ] Precisamos de DPA (Data Processing Agreement)?
- [ ] Como será tratado o direito de exclusão (LGPD art. 18)?
- [ ] Os dados podem ser usados para fine-tuning/treinamento do modelo?
- [ ] Qual a política de retenção de dados das conversações?
  - **Atenção:** MNV armazena conversa na íntegra!
- [ ] Haverá dados de menores de idade? (requer consentimento especial)
  - **Campo Idade está sendo enviado** - validar necessidade
- [ ] O LLM upstream (OpenAI, Anthropic, etc.) tem acesso aos dados? Qual a política deles?
- [ ] Precisamos de anonimização/pseudonimização dos dados?
- [ ] Haverá transferência internacional de dados?
- [ ] **Almai tem compliance LGPD?** Onde estão os servidores?
- [ ] **MNV tem compliance LGPD?** Onde armazenam as conversas?

### Preocupações

- **Vazamento de dados sensíveis via prompts/respostas do LLM**
- Prompt injection pode expor dados de outros usuários
- Necessidade de guardrails para filtrar PII nas respostas
- Compliance com LGPD, BACEN, e regulações de consórcio
- Consentimento do usuário final para uso de IA
- **Três empresas diferentes manipulando PII (PicPay, MNV, Almai)** - cadeia de responsabilidade
- **Dados financeiros sensíveis** (potencial de renda, valores de crédito/parcela)
- **Falha de pagamento por limite/saldo** - dado extremamente sensível sobre situação financeira

---

## 7. Contrato de API

### Dúvidas para o Upstream

- [ ] Qual formato de API? (REST, GraphQL, gRPC, WebSocket?)
- [ ] A API será síncrona ou assíncrona? (request-response vs streaming?)
- [ ] Qual o formato de request/response? (JSON, qual schema?)
- [ ] Haverá versionamento de API? Qual estratégia? (URL, header?)
- [ ] Qual a política de deprecação de versões antigas?
- [ ] O parceiro precisa de SDK ou biblioteca client?
- [ ] Haverá sandbox/ambiente de testes?
- [ ] Como será a documentação? (OpenAPI/Swagger?)
- [ ] Suportaremos streaming de responses (SSE, WebSocket)?

### Preocupações

- Breaking changes podem impactar produção do parceiro
- Necessidade de backward compatibility
- Documentação precisa estar sempre atualizada

---

## 8. Modelo de LLM

### Dúvidas para o Upstream

- [ ] Qual modelo será utilizado? (GPT-4, Claude, Gemini, modelo próprio?)
- [ ] O parceiro pode escolher/trocar o modelo?
- [ ] Haverá fallback para outro modelo em caso de indisponibilidade?
- [ ] Quais parâmetros o parceiro pode customizar? (temperature, max_tokens, etc.)
- [ ] O modelo será fine-tuned para consórcios ou genérico?
- [ ] Há restrições de conteúdo/safety filters que precisamos considerar?
- [ ] Qual o context window máximo suportado?
- [ ] Suportaremos function calling/tool use?

### Preocupações

- Custo varia significativamente entre modelos
- Qualidade das respostas para domínio específico de consórcio
- Alucinações do modelo podem gerar informações incorretas sobre contratos
- Mudanças no modelo upstream podem afetar comportamento

---

## 9. Contexto e Prompts

### Dúvidas para o Upstream

- [ ] O parceiro enviará system prompt próprio ou usará um padrão nosso?
- [ ] Haverá prompt templates pré-definidos para consórcio?
- [ ] Como será gerenciado o histórico de conversação? (stateless vs stateful?)
- [ ] Qual o limite de histórico de mensagens por sessão?
- [ ] O parceiro pode injetar contexto adicional (RAG, documentos)?
- [ ] Haverá validação/sanitização dos prompts recebidos?
- [ ] Suportaremos multi-turn conversations nativamente?

### Preocupações

- **Prompt injection** - usuário mal-intencionado pode manipular comportamento
- Jailbreak attempts para contornar guardrails
- Custo de tokens aumenta com histórico longo
- Necessidade de truncar contexto de forma inteligente

---

## 10. Fallbacks e Resiliência

### Dúvidas para o Upstream

- [ ] O que acontece quando o LLM está indisponível?
- [ ] Haverá respostas fallback pré-definidas?
- [ ] O parceiro deve implementar retry ou nós implementamos?
- [ ] Qual a estratégia de retry? (exponential backoff, jitter?)
- [ ] Haverá circuit breaker? Quais os thresholds?
- [ ] Como será o comportamento em caso de timeout?
- [ ] Haverá degradação graceful? (respostas mais simples em alta carga?)
- [ ] O parceiro precisa de dead letter queue para requests falhos?

### Preocupações

- Experiência do usuário final em caso de falha
- Mensagens claras de erro vs mensagens genéricas
- Idempotência de requests para retry seguro

---

## 11. Questões Operacionais

### Dúvidas para o Upstream

- [ ] Qual o timeline esperado para go-live?
- [ ] Haverá fase piloto/beta antes do lançamento geral?
- [ ] Quem são os pontos de contato técnicos do parceiro?
- [ ] Como será o processo de suporte? (ticket, Slack, telefone?)
- [ ] Qual o horário de suporte esperado? (8x5, 24x7?)
- [ ] Haverá runbook compartilhado para troubleshooting?
- [ ] Como serão coordenados deploys que podem afetar a integração?
- [ ] Qual a frequência de releases esperada?
- [ ] Haverá ambiente de homologação espelhando produção?
- [ ] Como será o processo de rollback em caso de problemas?

### Preocupações

- Alinhamento de janelas de deploy entre times
- Comunicação de mudanças com antecedência adequada
- Processo claro de escalation para incidentes críticos

---

## 12. Integrações e APIs

### API PicPay → MNV (Envio de Leads)

#### Dúvidas
- [ ] Qual endpoint MNV vai expor para receber leads?
- [ ] Qual formato do payload? (sugestão baseada nos dados identificados)
- [ ] Autenticação da API? (API Key, OAuth, mTLS?)
- [ ] Rate limit do lado MNV?
- [ ] Retry policy em caso de falha?
- [ ] Webhook de confirmação de recebimento?

#### Payload Sugerido (Validar com MNV)
```json
{
  "lead_id": "uuid",
  "timestamp": "ISO8601",
  "abandonment_type": "timeout|close_button",
  "customer": {
    "name": "string",
    "phone": "string",
    "age": "number",
    "potential": "low_income|high_income"
  },
  "simulation": {
    "segment": "string",
    "credit_value": "number",
    "installment_value": "number"
  },
  "selected_group": {
    "credit_value": "number",
    "installment_value": "number",
    "installment_type": "fixed|reduced",
    "admin_fee": "number",
    "total_term": "number"
  },
  "payment_error": {
    "type": "limit|balance|other",
    "message": "string"
  }
}
```

### API MNV → PicPay (Retorno de Leads Encerrados)

#### Dúvidas
- [ ] Qual endpoint PicPay vai expor?
- [ ] Qual formato do payload de retorno?
- [ ] Quais dados de conversa serão incluídos?
- [ ] Status possíveis do lead? (convertido, desistiu, não respondeu, etc.)
- [ ] SLA para retorno do lead?

#### Payload Sugerido (Validar internamente)
```json
{
  "lead_id": "uuid",
  "closed_at": "ISO8601",
  "status": "converted|dropped|no_response|transferred_to_sales",
  "conversation_summary": "string",
  "main_concerns": ["price", "trust", "admin_fee", "contemplation"],
  "segment_changed": "boolean",
  "new_segment": "string|null",
  "conversation_duration_seconds": "number"
}
```

### API Almai (Provedor LLM)

#### Dúvidas
- [ ] Qual o contrato de API da Almai?
- [ ] PicPay fala diretamente com Almai ou via MNV?
- [ ] Qual modelo de LLM será usado?
- [ ] Há system prompt específico para consórcios?
- [ ] Suporta streaming?

---

## 13. Arquitetura de Dados (Databricks)

### Dúvidas
- [ ] Qual o schema das tabelas no Databricks?
- [ ] Qual a frequência de atualização? (real-time, batch?)
- [ ] Quem terá acesso ao dashboard?
- [ ] Haverá alertas automáticos?
- [ ] Dados serão anonimizados para analytics?

### Dados Esperados no Dashboard
- Leads recebidos por dia/hora
- Taxa de resposta
- Taxa de conversão
- Tempo médio de conversa
- Principais motivos de desistência
- Comparativo de segmentos (lead vs conversão)

---

## 14. Horários e SLAs de Envio

### Dúvidas Críticas
- [ ] **Horário permitido para envio de mensagens WhatsApp?**
  - Restrições legais? (8h-20h?)
  - Preferência do usuário?
- [ ] **Delay entre abandono e primeiro contato?**
  - Imediato após 5min?
  - Aguardar horário comercial?
- [ ] **Limite de mensagens por dia por usuário?**
- [ ] **Política de opt-out?** Como o cliente para de receber mensagens?
- [ ] **Expiração do chat?** Tempo máximo de inatividade antes de encerrar?

### Preocupações
- Mensagens em horários inadequados podem irritar o cliente
- Spam pode levar a bloqueio do número WhatsApp
- Regulação do WhatsApp Business sobre mensagens automatizadas

---

## 15. Próximos Passos

1. **Responder dúvidas do negócio** (seção "Dúvidas Já Levantadas")
2. **Agendar reunião de discovery** com time técnico do parceiro (MNV + Almai)
3. **Validar respostas** das perguntas técnicas
4. **Definir contratos de API** (ambas as direções)
5. **Criar ADR** (Architecture Decision Record) com decisões técnicas
6. **Especificar contrato de API** (OpenAPI spec)
7. **Definir plano de testes** de integração
8. **Estabelecer cronograma** com milestones claros
9. **Validar compliance LGPD** com todas as partes

---

## Anexos

### Checklist Pré-Refinamento

- [ ] NDA assinado com MNV
- [ ] NDA assinado com Almai
- [ ] Contrato comercial alinhado
- [ ] Stakeholders identificados (ambos os lados)
- [ ] Canais de comunicação estabelecidos
- [ ] Acesso a documentação dos parceiros
- [ ] **DPA (Data Processing Agreement) com MNV**
- [ ] **DPA (Data Processing Agreement) com Almai**
- [ ] **Validação jurídica do fluxo de dados PII**

### Documentos Relacionados

- [ ] Arquitetura de referência do provedor LLM
- [ ] Políticas de segurança PicPay
- [ ] Guia de integração de parceiros
- [ ] Template de DPA
- [ ] **Documentação API MNV**
- [ ] **Documentação API Almai**
- [ ] **Políticas WhatsApp Business**

---

## Resumo Executivo - Riscos Principais

| Risco | Impacto | Mitigação |
|-------|---------|----------|
| Vazamento de PII (nome, telefone, dados financeiros) | 🔴 Alto | DPA, encryption, audit logs |
| Três empresas manipulando dados sensíveis | 🔴 Alto | Cadeia de responsabilidade clara, contratos |
| Mensagens em horários inadequados | 🟡 Médio | Política de horários, opt-out |
| LLM gerando informações incorretas sobre consórcio | 🟡 Médio | Guardrails, validação de respostas |
| Chat expirando sem resolução | 🟡 Médio | Política de timeout, handoff para humano |
| Telefone desatualizado | 🟢 Baixo | Validação prévia, fallback email |
| Spam/bloqueio do WhatsApp | 🟡 Médio | Rate limiting, política de contato |
