import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@codebuff/internal/env'

/**
 * Model mapping table for custom transformations
 * Add entries here if you need to map a model name to a different one
 * Example: { 'anthropic/claude-sonnet-4': 'claude-sonnet-4-custom' }
 */
const MODEL_MAPPING: Record<string, string> = {
  // Add custom model mappings here as needed
  'gpt-5-mini': 'grok-code-fast-1',
}

/**
 * Extracts the model name from a full model identifier by removing the provider prefix.
 * Examples:
 *   'openai/gpt-5-mini' -> 'gpt-5-mini'
 *   'x-ai/grok-4-fast' -> 'grok-4-fast'
 *   'gpt-4o' -> 'gpt-4o' (no change if no slash)
 * 
 * Also applies any custom mappings from MODEL_MAPPING table.
 */
export function getMappedModel(model: string): string {
  // First, remove provider prefix if present
  const slashIndex = model.indexOf('/')
  const modelWithoutPrefix = slashIndex !== -1 ? model.slice(slashIndex + 1) : model
  
  // Then apply custom mapping if exists
  return MODEL_MAPPING[modelWithoutPrefix] ?? modelWithoutPrefix
}

/**
 * Create OpenAI provider with custom base URL
 * 
 * This provider enables using OpenAI-compatible APIs through a custom base URL.
 * Configuration:
 * - Base URL: http://localhost:4141 (can be customized)
 * - API Key: Set via OPENAI_API_KEY environment variable
 * 
 * Transform function filters out incompatible parameters for local providers
 */
const openaiProvider = createOpenAI({
  name: 'openai',
  apiKey: 'dummy_openai_key',
  baseURL: 'http://localhost:4141',
  headers: {
    'HTTP-Referer': 'https://codebuff.com',
    'X-Title': 'Codebuff',
  },
  fetch: (async (url: RequestInfo | URL, options?: RequestInit) => {
    const requestOptions = options ? { ...options } : {}
    
    // Filter out problematic parameters for local provider compatibility
    if (requestOptions.body && typeof requestOptions.body === 'string') {
      try {
        const body = JSON.parse(requestOptions.body)
        
        // Remove stop sequences that cause issues with local providers
        if (body.stop) {
          delete body.stop
        }
        
        requestOptions.body = JSON.stringify(body)
      } catch {
        // If parsing fails, leave body as-is
      }
    }
    
    return fetch(url, requestOptions)
  }) as typeof fetch,
})

export const openai = {
  chat: (model: string) => openaiProvider.chat(getMappedModel(model)),
  languageModel: (model: string) => openaiProvider.languageModel(getMappedModel(model)),
  responses: (model: string) => openaiProvider.responses(getMappedModel(model)),
}