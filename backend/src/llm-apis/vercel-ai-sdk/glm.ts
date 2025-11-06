import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@codebuff/internal/env'

/**
 * Create GLM (Z.AI) provider using OpenAI-compatible API
 * Based on: https://docs.z.ai/scenario-example/develop-tools/gemini
 * 
 * This provider enables using Z.AI's GLM models through their OpenRouter-compatible API
 * Configuration:
 * - Base URL: https://api.z.ai/api/coding/paas/v4
 * - API Key: Set via GLM_API_KEY environment variable
 */
export const glm = createOpenAI({
  name: 'glm',
  apiKey: env.GLM_API_KEY,
  baseURL: 'https://api.z.ai/api/coding/paas/v4',
  headers: {
    'HTTP-Referer': 'https://codebuff.com',
    'X-Title': 'Codebuff',
  },
})
