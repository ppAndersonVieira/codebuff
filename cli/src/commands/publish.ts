import { WEBSITE_URL } from '@codebuff/sdk'

import { getUserCredentials } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { loadAgentDefinitions, getLoadedAgentsData, getUserAgentDefinitions } from '../utils/local-agent-registry'

import type {
  PublishAgentsErrorResponse,
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'

export interface PublishResult {
  success: boolean
  publisherId?: string
  agents?: Array<{
    id: string
    version: string
    displayName: string
  }>
  error?: string
  details?: string
  hint?: string
  /** For 'publish all' - total agents successfully published */
  totalSuccess?: number
  /** For 'publish all' - total agents that failed to publish */
  totalFailed?: number
  /** For 'publish all' - indicates this was a batch publish */
  isBatchPublish?: boolean
}

/**
 * Publish agent templates to the backend
 */
async function publishAgentTemplates(
  data: Record<string, any>[],
  authToken: string,
  allLocalAgentIds: string[],
): Promise<PublishAgentsResponse & { statusCode?: number }> {
  setApiClientAuthToken(authToken)
  const apiClient = getApiClient()

  try {
    const response = await apiClient.publish(data, allLocalAgentIds)

    if (!response.ok) {
      // Try to use the full error data if available (includes details, hint, etc.)
      const errorData = response.errorData as
        | Partial<PublishAgentsErrorResponse>
        | undefined
      return {
        success: false,
        error: errorData?.error ?? response.error ?? 'Unknown error',
        details: errorData?.details,
        hint: errorData?.hint,
        availablePublishers: errorData?.availablePublishers,
        validationErrors: errorData?.validationErrors,
        statusCode: response.status,
      }
    }

    // Guard against empty/undefined response data
    if (!response.data) {
      return {
        success: false,
        error: 'Failed to parse server response - empty response body',
        statusCode: response.status,
      }
    }

    return {
      ...response.data,
      statusCode: response.status,
    }
  } catch (err: any) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        success: false,
        error: `Network error: Unable to connect to ${WEBSITE_URL}. Please check your internet connection and try again.`,
      }
    }

    const body = err?.responseBody || err?.body || err
    const error = body?.error || body?.message || 'Failed to publish'
    const details = body?.details
    const hint = body?.hint

    return {
      success: false,
      error,
      details,
      hint,
    }
  }
}

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentIds The ids or display names of the agents to publish
 * @returns PublishResult with success/error information
 */
export async function handlePublish(agentIds: string[]): Promise<PublishResult> {
  const user = getUserCredentials()

  if (!user) {
    return {
      success: false,
      error: 'Not logged in',
      hint: 'Please log in first using "login" command or web UI.',
    }
  }

  const availableAgents = getLoadedAgentsData()?.agents || []

  if (agentIds?.length === 0) {
    return {
      success: false,
      error: 'No agents specified',
      hint: 'Usage: publish <agent-id> [agent-id2] ... or publish all',
    }
  }

  try {
    const loadedDefinitions = loadAgentDefinitions()

    if (loadedDefinitions.length === 0) {
      return {
        success: false,
        error: 'No valid agent templates found in .agents directory.',
      }
    }

    // Check if user wants to publish all agents
    const isPublishAll = agentIds.length === 1 && agentIds[0].toLowerCase() === 'all'
    
    if (isPublishAll) {
      // Publish all local agents that have a publisher defined
      const userAgents = getUserAgentDefinitions()
      const publishableAgents = userAgents.filter((agent: any) => {
        // Include agents that have a publisher defined
        return agent.publisher && agent.publisher.length > 0
      })
      
      if (publishableAgents.length === 0) {
        return {
          success: false,
          error: 'No publishable agents found in .agents directory.',
          hint: 'Create agents with a "publisher" field in your .agents directory to publish them.',
        }
      }
      return handlePublishAll(publishableAgents, user.authToken!)
    }

    const matchingTemplates: Record<string, any> = {}

    for (const agentId of agentIds) {
      // Find the specific agent
      const matchingTemplate = loadedDefinitions.find(
        (template) =>
          template.id === agentId || (template as any).displayName === agentId,
      )

      if (!matchingTemplate) {
        const availableList = availableAgents
          .map((agent) =>
            agent.displayName && agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName || agent.id,
          )
          .join(', ')
        return {
          success: false,
          error: `Agent "${agentId}" not found`,
          details: `Available agents: ${availableList}`,
        }
      }

      // Process the template for publishing
      const processedTemplate = { ...matchingTemplate }

      // Convert handleSteps function to string if present
      if (typeof (matchingTemplate as any).handleSteps === 'function') {
        ;(processedTemplate as any).handleSteps = (
          matchingTemplate as any
        ).handleSteps.toString()
      }

      matchingTemplates[matchingTemplate.id] = processedTemplate
    }

    // Get all local agent IDs so the server knows which agents exist locally
    // (even if not being published) for validation purposes
    const allLocalAgentIds = loadedDefinitions.map((template) => template.id)

    const result = await publishAgentTemplates(
      Object.values(matchingTemplates),
      user.authToken!,
      allLocalAgentIds,
    )

    if (result.success) {
      return {
        success: true,
        publisherId: result.publisherId,
        agents: result.agents ?? [],
      }
    }

    // Build error result
    let hint = result.hint
    if (result.error?.includes('Publisher field required')) {
      hint = 'Add a "publisher" field to your agent templates.'
    } else if (result.error?.includes('Publisher not found or not accessible')) {
      hint = `Check that the publisher ID is correct and you have access to it. Visit ${WEBSITE_URL}/publishers to manage publishers.`
    }

    return {
      success: false,
      error: result.error,
      details: result.details,
      hint,
    }
  } catch (error) {
    return {
      success: false,
      error: 'Publish failed',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Extract local agent ID from a spawnable agent reference.
 * Handles formats like "my-agent", "publisher/my-agent", "publisher/my-agent@1.0.0"
 * Returns the base agent ID without publisher prefix or version suffix.
 */
function extractLocalAgentId(spawnableRef: string): string {
  // Remove version suffix if present (e.g., "@1.0.0")
  const withoutVersion = spawnableRef.split('@')[0]
  // Remove publisher prefix if present (e.g., "publisher/")
  const parts = withoutVersion.split('/')
  return parts[parts.length - 1]
}

/**
 * Perform topological sort on agents based on their spawnableAgents dependencies.
 * Returns agents ordered so that dependencies are published before dependents.
 */
function topologicalSortAgents(agents: any[]): any[] {
  const agentMap = new Map<string, any>()
  const inDegree = new Map<string, number>()
  const adjacencyList = new Map<string, string[]>()
  
  // Build maps
  for (const agent of agents) {
    agentMap.set(agent.id, agent)
    inDegree.set(agent.id, 0)
    adjacencyList.set(agent.id, [])
  }
  
  // Build dependency graph (edges from dependency to dependent)
  // If A spawns B, B must be published before A, so B -> A
  for (const agent of agents) {
    const spawnableAgents = agent.spawnableAgents || []
    for (const spawnableRef of spawnableAgents) {
      const depId = extractLocalAgentId(spawnableRef)
      // Only consider dependencies that are in our local agent set
      if (agentMap.has(depId)) {
        // depId -> agent.id (dependency must come before dependent)
        adjacencyList.get(depId)!.push(agent.id)
        inDegree.set(agent.id, (inDegree.get(agent.id) || 0) + 1)
      }
    }
  }
  
  // Kahn's algorithm for topological sort
  const queue: string[] = []
  const sorted: any[] = []
  
  // Start with agents that have no dependencies (in-degree 0)
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id)
    }
  }
  
  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(agentMap.get(current)!)
    
    for (const dependent of adjacencyList.get(current) || []) {
      const newDegree = (inDegree.get(dependent) || 1) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) {
        queue.push(dependent)
      }
    }
  }
  
  // If we couldn't sort all agents, there's a cycle - just append remaining
  // in original order to avoid losing them
  if (sorted.length < agents.length) {
    const sortedIds = new Set(sorted.map(a => a.id))
    for (const agent of agents) {
      if (!sortedIds.has(agent.id)) {
        sorted.push(agent)
      }
    }
  }
  
  return sorted
}

/**
 * Handle publishing all agents from .agents directory
 * Sorts agents by dependencies (topological order) and publishes one by one
 * to ensure dependencies are published before dependents.
 */
async function handlePublishAll(
  loadedDefinitions: any[],
  authToken: string,
): Promise<PublishResult> {
  // Sort agents topologically by dependencies
  const sortedAgents = topologicalSortAgents(loadedDefinitions)
  
  // Process templates for publishing
  const processedAgents: any[] = []
  for (const template of sortedAgents) {
    const processedTemplate = { ...template }
    
    // Convert handleSteps function to string if present
    if (typeof template.handleSteps === 'function') {
      processedTemplate.handleSteps = template.handleSteps.toString()
    }
    
    processedAgents.push(processedTemplate)
  }

  // Get all local agent IDs for validation purposes
  const allLocalAgentIds = loadedDefinitions.map((template) => template.id)

  let totalSuccess = 0
  let totalFailed = 0
  const allPublishedAgents: Array<{ id: string; version: string; displayName: string }> = []
  let lastPublisherId: string | undefined
  let lastError: string | undefined
  let lastDetails: string | undefined
  let lastHint: string | undefined

  // Publish agents one by one in dependency order
  for (const agent of processedAgents) {
    const result = await publishAgentTemplates(
      [agent],
      authToken,
      allLocalAgentIds,
    )

    if (result.success) {
      totalSuccess += 1
      if (result.agents) {
        allPublishedAgents.push(...result.agents)
      }
      lastPublisherId = result.publisherId
    } else {
      totalFailed += 1
      lastError = result.error
      lastDetails = result.details
      
      // Build helpful hint based on error type
      if (result.error?.includes('Publisher field required')) {
        lastHint = 'Add a "publisher" field to your agent templates.'
      } else if (result.error?.includes('Publisher not found or not accessible')) {
        lastHint = `Check that the publisher ID is correct and you have access to it. Visit ${WEBSITE_URL}/publishers to manage publishers.`
      } else {
        lastHint = result.hint
      }
    }
  }

  // Return aggregated result
  if (totalSuccess > 0 && totalFailed === 0) {
    return {
      success: true,
      publisherId: lastPublisherId,
      agents: allPublishedAgents,
      totalSuccess,
      totalFailed,
      isBatchPublish: true,
    }
  } else if (totalSuccess > 0 && totalFailed > 0) {
    // Partial success
    return {
      success: true,
      publisherId: lastPublisherId,
      agents: allPublishedAgents,
      error: `Some agents failed to publish`,
      details: lastDetails,
      hint: lastHint,
      totalSuccess,
      totalFailed,
      isBatchPublish: true,
    }
  } else {
    // All failed
    return {
      success: false,
      error: lastError || 'Failed to publish all agents',
      details: lastDetails,
      hint: lastHint,
      totalSuccess,
      totalFailed,
      isBatchPublish: true,
    }
  }
}
