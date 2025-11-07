import * as fs from 'fs'

import { cyan, green, red, yellow } from 'picocolors'

import { getAgentsDirectory } from '../agents/agent-utils'
import { loadLocalAgents } from '../agents/load-agents'
import { websiteUrl } from '../config'
import { getUserCredentials } from '../credentials'

import type {
  PublishAgentsErrorResponse,
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import { pluralize } from '@codebuff/common/util/string'

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentId The id of the agent to publish (required)
 */ export async function handlePublish(agentIds: string[]): Promise<void> {
  const user = getUserCredentials()

  if (!user) {
    console.log(red('Please log in first using "login".'))
    return
  }

  if (agentIds?.length === 0) {
    console.log(
      red('Agent id is required. Usage: publish <agent-id> [agent-id2] ...'),
    )
    console.log(cyan('\nOr use "all" to publish all agents:'))
    console.log(yellow('  publish all\n'))

    // Show available agents
    const agentsDir = getAgentsDirectory()
    if (fs.existsSync(agentsDir)) {
      const agentTemplates = await loadLocalAgents({ verbose: false })
      if (Object.keys(agentTemplates).length > 0) {
        console.log(cyan('Available agents:'))
        Object.values(agentTemplates).forEach((template) => {
          console.log(`  - ${template.displayName} (${template.id})`)
        })
      }
    }
    return
  }

  // Check if user wants to publish all agents
  if (agentIds.length === 1 && agentIds[0].toLowerCase() === 'all') {
    const agentsDir = getAgentsDirectory()
    
    if (!fs.existsSync(agentsDir)) {
      console.log(red('No .agents directory found. Create agent templates first.'))
      return
    }

    const agentTemplates = await loadLocalAgents({ verbose: false })
    
    if (Object.keys(agentTemplates).length === 0) {
      console.log(red('No valid agent templates found in .agents directory.'))
      return
    }

    agentIds = Object.keys(agentTemplates)
    console.log(cyan(`Found ${agentIds.length} agents to publish:`))
    Object.values(agentTemplates).forEach((template) => {
      console.log(`  - ${template.displayName} (${template.id})`)
    })
    console.log()

    // Group agents by publisher for "all" command
    const agentsByPublisher = new Map<string, any[]>()
    
    for (const [agentId, template] of Object.entries(agentTemplates)) {
      const publisher = template.publisher || 'default'
      if (!agentsByPublisher.has(publisher)) {
        agentsByPublisher.set(publisher, [])
      }
      agentsByPublisher.get(publisher)!.push(template)
    }

    // Show the grouping
    if (agentsByPublisher.size > 1) {
      console.log(cyan('Agents will be published in groups by publisher:'))
      for (const [publisher, agents] of agentsByPublisher.entries()) {
        console.log(yellow(`  ${publisher}: ${agents.length} agent(s)`))
      }
      console.log()
    }
  }

  try {
    // Load agents from .agents directory
    const agentsDir = getAgentsDirectory()

    if (!fs.existsSync(agentsDir)) {
      console.log(
        red('No .agents directory found. Create agent templates first.'),
      )
      return
    }

    // Get all agent templates using existing loader
    const agentTemplates = await loadLocalAgents({ verbose: false })

    if (Object.keys(agentTemplates).length === 0) {
      console.log(red('No valid agent templates found in .agents directory.'))
      return
    }

    const matchingTemplates: Record<string, any> = {}
    for (const agentId of agentIds) {
      // Find the specific agent
      const matchingTemplate = Object.values(agentTemplates).find(
        (template) =>
          template.id === agentId || template.displayName === agentId,
      )

      if (!matchingTemplate) {
        console.log(red(`Agent "${agentId}" not found. Available agents:`))
        Object.values(agentTemplates).forEach((template) => {
          console.log(`  - ${template.displayName} (${template.id})`)
        })
        return
      }

      matchingTemplates[matchingTemplate.id] = matchingTemplate
    }
    console.log(yellow(`Publishing:`))
    for (const template of Object.values(matchingTemplates)) {
      console.log(`  - ${template.displayName} (${template.id})`)
    }

    // Group agents by publisher and publish them in batches
    const agentsByPublisher = new Map<string, any[]>()
    
    for (const template of Object.values(matchingTemplates)) {
      const publisher = template.publisher || 'default'
      if (!agentsByPublisher.has(publisher)) {
        agentsByPublisher.set(publisher, [])
      }
      agentsByPublisher.get(publisher)!.push(template)
    }

    // Publish agents in batches by publisher
    let totalSuccess = 0
    let totalFailed = 0
    
    for (const [publisher, agents] of agentsByPublisher.entries()) {
      if (agents.length === 0) continue
      
      console.log(cyan(`\nPublishing ${agents.length} agent(s) for publisher: ${publisher}`))
      
      for (const template of agents) {
        console.log(`  - ${template.displayName} (${template.id})`)
      }

      try {
        const result = await publishAgentTemplates(
          agents,
          user.authToken!,
        )

        if (result.success) {
          console.log(green(`✅ Successfully published ${result.agents.length}/${agents.length} agent(s):`))
          for (const agent of result.agents) {
            console.log(
              cyan(
                `  - ${agent.displayName} (${result.publisherId}/${agent.id}@${agent.version})`,
              ),
            )
          }
          totalSuccess += result.agents.length
        } else {
          console.log(red(`❌ Failed to publish ${agents.length} agent(s) for publisher: ${publisher}`))
          if (result.details) console.log(red(`\n${result.details}`))
          if (result.hint) console.log(yellow(`\nHint: ${result.hint}`))

          // Show helpful guidance based on error type
          if (result.error?.includes('Publisher field required')) {
            console.log()
            console.log(cyan('Add a "publisher" field to your agent templates:'))
            console.log(yellow('  "publisher": "<publisher-id>"'))
            console.log()
          } else if (
            result.error?.includes('Publisher not found or not accessible')
          ) {
            console.log()
            console.log(
              cyan(
                'Check that the publisher ID is correct and you have access to it.',
              ),
            )
            console.log()
          }

          console.log(cyan('Visit the website to manage your publishers:'))
          console.log(yellow(`${websiteUrl}/publishers`))
          totalFailed += agents.length
        }
      } catch (error) {
        console.log(
          red(
            `❌ Error publishing agents for publisher ${publisher}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
        totalFailed += agents.length
        // Avoid logger.error here as it can cause sonic boom errors that mask the real error
        // The error is already displayed to the user via console.log above
      }
    }

    // Show final summary
    console.log(cyan('\n📊 Publishing Summary:'))
    
    for (const [publisher, agents] of agentsByPublisher.entries()) {
      console.log(yellow(`  ${publisher}: ${agents.length} agent(s) processed`))
    }
    
    if (totalSuccess > 0 || totalFailed > 0) {
      console.log(cyan('\nFinal Results:'))
      console.log(green(`  ✅ Successfully published: ${totalSuccess} agent(s)`))
      if (totalFailed > 0) {
        console.log(red(`  ❌ Failed to publish: ${totalFailed} agent(s)`))
      }
      console.log(cyan(`  📈 Total processed: ${totalSuccess + totalFailed} agent(s)`))
    }
  } catch (error) {
    console.log(
      red(
        `Error during publish: ${error instanceof Error ? error.message + '\n' + error.stack : String(error)}`,
      ),
    )
    // Avoid logger.error here as it can cause sonic boom errors that mask the real error
    // The error is already displayed to the user via console.log above
  }
}

/**
 * Publish agent templates to the backend
 */
async function publishAgentTemplates(
  data: Record<string, any>[],
  authToken: string,
): Promise<PublishAgentsResponse & { statusCode?: number }> {
  try {
    const response = await fetch(`${websiteUrl}/api/agents/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        authToken,
      }),
    })

    let result: PublishAgentsResponse
    try {
      result = await response.json()
    } catch (jsonError) {
      return {
        success: false,
        error: `Failed to parse server response: ${response.status} ${response.statusText}`,
        statusCode: response.status,
      }
    }

    if (!response.ok) {
      result = result as PublishAgentsErrorResponse
      // Build clean error object without duplicating details into the error string
      return {
        success: false,
        error:
          result.error || `HTTP ${response.status}: ${response.statusText}`,
        details: result.details,
        hint: result.hint,
        statusCode: response.status,
        availablePublishers: result.availablePublishers,
        validationErrors: result.validationErrors,
      }
    }

    return {
      ...result,
      statusCode: response.status,
    }
  } catch (err: any) {
    // Handle network errors, timeouts, etc.
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        success: false,
        error: `Network error: Unable to connect to ${websiteUrl}. Please check your internet connection and try again.`,
      }
    }

    const body = err?.responseBody || err?.body || err
    const error = body?.error || body?.message || 'Failed to publish'
    const details = body?.details
    const hint = body?.hint

    // Log for visibility
    console.error(`❌ Failed to publish: ${error}`)
    if (details) console.error(`\nDetails: ${details}`)
    if (hint) console.error(`\nHint: ${hint}`)

    // Return a valid error object so callers can display the hint
    return {
      success: false,
      error,
      details,
      hint,
    } as PublishAgentsResponse
  }
}
