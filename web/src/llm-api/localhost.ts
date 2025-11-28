import { getErrorObject } from '@codebuff/common/util/error'

import {
  consumeCreditsForMessage,
  extractRequestMetadata,
  insertMessageToBigQuery,
} from './helpers'

import type { UsageData } from './helpers'
import type { InsertMessageBigqueryFn } from '@codebuff/common/types/contracts/bigquery'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const LOCALHOST_BASE_URL = 'http://localhost:4141'

type StreamState = { responseText: string; reasoningText: string }

/**
 * Model mapping table for custom transformations
 * Maps incoming model names to the ones expected by the local provider
 */
const MODEL_MAPPING: Record<string, string> = {
  'gpt-5-mini': 'claude-haiku-4.5',
  'gemini-2.5-flash': 'claude-haiku-4.5',
  'grok-4-fast': 'claude-haiku-4.5',
  'gemini-2.0-flash-001': 'claude-haiku-4.5',
  'gpt-5.1':'gpt-5'
}

/**
 * Extracts the model name from a full model identifier by removing the provider prefix.
 * Also applies any custom mappings from MODEL_MAPPING table.
 */
function getMappedModel(model: string): string {
  const slashIndex = model.indexOf('/')
  const modelWithoutPrefix =
    slashIndex !== -1 ? model.slice(slashIndex + 1) : model
  return MODEL_MAPPING[modelWithoutPrefix] ?? modelWithoutPrefix
}

function createLocalhostRequest(params: {
  body: any
  fetch: typeof globalThis.fetch
}) {
  const { body, fetch } = params

  // Map the model name
  const mappedBody = {
    ...body,
    model: getMappedModel(body.model || ''),
  }

  // Remove stop sequences that cause issues with local providers
  if (mappedBody.stop) {
    delete mappedBody.stop
  }

  return fetch(`${LOCALHOST_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer dummy_openai_key',
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mappedBody),
  })
}

function extractUsageAndCost(usage: any): UsageData {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    cost: 0, // Local provider has no cost
  }
}

export async function handleLocalhostNonStream({
  body,
  userId,
  agentId,
  fetch,
  logger,
  insertMessageBigquery,
}: {
  body: any
  userId: string
  agentId: string
  fetch: typeof globalThis.fetch
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const startTime = new Date()
  const { clientId, clientRequestId } = extractRequestMetadata({ body, logger })

  const response = await createLocalhostRequest({ body, fetch })

  if (!response.ok) {
    const errorText = await response.text()
    
    // Try to parse the error as JSON to extract the error code/message
    // The SDK's getRetryableErrorCode checks for 'model_max_prompt_tokens_exceeded' and
    // 'prompt token count ... exceeds the limit' in the error message
    let errorMessage = `Localhost API error: ${response.statusText}`
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message
        if (errorJson.error.code) {
          errorMessage = `${errorMessage} (code: ${errorJson.error.code})`
        }
      } else if (errorText) {
        errorMessage = `Localhost API error: ${response.statusText} - ${errorText}`
      }
    } catch {
      if (errorText) {
        errorMessage = `Localhost API error: ${response.statusText} - ${errorText}`
      }
    }

    logger.error(
      { status: response.status, statusText: response.statusText, errorMessage },
      'Localhost API error',
    )
    throw new Error(errorMessage)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const reasoningText = data.choices?.[0]?.message?.reasoning ?? ''
  const usageData = extractUsageAndCost(data.usage)

  // Insert into BigQuery (don't await)
  insertMessageToBigQuery({
    messageId: data.id || `localhost-${Date.now()}`,
    userId,
    startTime,
    request: body,
    reasoningText,
    responseText: content,
    usageData,
    logger,
    insertMessageBigquery,
  }).catch((error) => {
    logger.error({ error }, 'Failed to insert message into BigQuery')
  })

  // Consume credits (with zero cost for localhost)
  await consumeCreditsForMessage({
    messageId: data.id || `localhost-${Date.now()}`,
    userId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: data.model || body.model,
    reasoningText,
    responseText: content,
    usageData,
    byok: true, // Treat localhost as BYOK (no credits consumed)
    logger,
  })

  return data
}

export async function handleLocalhostStream({
  body,
  userId,
  agentId,
  fetch,
  logger,
  insertMessageBigquery,
}: {
  body: any
  userId: string
  agentId: string
  fetch: typeof globalThis.fetch
  logger: Logger
  insertMessageBigquery: InsertMessageBigqueryFn
}) {
  const startTime = new Date()
  const { clientId, clientRequestId } = extractRequestMetadata({ body, logger })

  const response = await createLocalhostRequest({ body, fetch })

  if (!response.ok) {
    const errorText = await response.text()
    
    // Try to parse the error as JSON to extract the error code/message
    // The SDK's getRetryableErrorCode checks for 'model_max_prompt_tokens_exceeded' and
    // 'prompt token count ... exceeds the limit' in the error message
    let errorMessage = `Localhost API error: ${response.statusText}`
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message
        if (errorJson.error.code) {
          errorMessage = `${errorMessage} (code: ${errorJson.error.code})`
        }
      } else if (errorText) {
        errorMessage = `Localhost API error: ${response.statusText} - ${errorText}`
      }
    } catch {
      if (errorText) {
        errorMessage = `Localhost API error: ${response.statusText} - ${errorText}`
      }
    }

    logger.error(
      { status: response.status, statusText: response.statusText, errorMessage },
      'Localhost API error',
    )
    throw new Error(errorMessage)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let state: StreamState = { responseText: '', reasoningText: '' }
  let clientDisconnected = false
  let messageId = `localhost-${Date.now()}`
  let modelName = body.model

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      controller.enqueue(
        new TextEncoder().encode(`: connected ${new Date().toISOString()}\n`),
      )

      heartbeatInterval = setInterval(() => {
        if (!clientDisconnected) {
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `: heartbeat ${new Date().toISOString()}\n\n`,
              ),
            )
          } catch {
            // client disconnected, ignore error
          }
        }
      }, 30000)

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            // Process the line to extract content
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const raw = line.slice('data: '.length)
                const parsed = JSON.parse(raw)
                if (parsed.id) messageId = parsed.id
                if (parsed.model) modelName = parsed.model
                const content = parsed.choices?.[0]?.delta?.content ?? ''
                const reasoning = parsed.choices?.[0]?.delta?.reasoning ?? ''
                state.responseText += content
                state.reasoningText += reasoning
              } catch {
                // Ignore parse errors
              }
            }

            if (!clientDisconnected) {
              try {
                controller.enqueue(new TextEncoder().encode(line))
              } catch (error) {
                logger.warn(
                  'Client disconnected during stream, continuing for billing',
                )
                clientDisconnected = true
              }
            }

            lineEnd = buffer.indexOf('\n')
          }
        }

        // Stream finished - log and consume credits
        const usageData: UsageData = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          reasoningTokens: 0,
          cost: 0,
        }

        insertMessageToBigQuery({
          messageId,
          userId,
          startTime,
          request: body,
          reasoningText: state.reasoningText,
          responseText: state.responseText,
          usageData,
          logger,
          insertMessageBigquery,
        }).catch((error) => {
          logger.error({ error }, 'Failed to insert message into BigQuery')
        })

        await consumeCreditsForMessage({
          messageId,
          userId,
          agentId,
          clientId,
          clientRequestId,
          startTime,
          model: modelName,
          reasoningText: state.reasoningText,
          responseText: state.responseText,
          usageData,
          byok: true,
          logger,
        })

        if (!clientDisconnected) {
          controller.close()
        }
      } catch (error) {
        if (!clientDisconnected) {
          controller.error(error)
        } else {
          logger.warn(
            getErrorObject(error),
            'Error after client disconnect in localhost stream',
          )
        }
      } finally {
        clearInterval(heartbeatInterval)
      }
    },
    cancel() {
      clearInterval(heartbeatInterval)
      clientDisconnected = true
      logger.warn(
        { clientDisconnected, state },
        'Client cancelled stream, continuing localhost consumption for billing',
      )
    },
  })

  return stream
}
