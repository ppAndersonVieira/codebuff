import { existsSync, readFileSync } from 'fs'
import path from 'path'

import {
  codebuffConfigFile,
  codebuffConfigFileBackup,
  CodebuffConfigSchema,
} from './constants'
import { getDefaultConfig } from './default'

import type { CodebuffConfig } from './constants'

/**
 * Simple JSONC parser that strips comments and trailing commas.
 * This is a lightweight alternative to jsonc-parser that works better with Bun's bundler.
 */
export function parseJsonc(text: string): any {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
    } else {
      if (char === '"') {
        inString = true
        result += char
      } else if (char === '/' && nextChar === '/') {
        // Skip single-line comment
        while (i < text.length && text[i] !== '\n') {
          i++
        }
        if (i < text.length) result += text[i] // Add the newline
      } else if (char === '/' && nextChar === '*') {
        // Skip multi-line comment
        i += 2
        while (
          i < text.length - 1 &&
          !(text[i] === '*' && text[i + 1] === '/')
        ) {
          i++
        }
        i++ // Skip the closing '/'
      } else {
        result += char
      }
    }
  }

  // Remove trailing commas before closing brackets/braces
  result = result.replace(/,(\s*[}\]])/g, '$1')

  return JSON.parse(result)
}

export interface LoadCodebuffConfigOptions {
  /** The project root directory. If not provided, uses process.cwd() */
  projectPath?: string
  /** Custom file system for reading files (optional) */
  readFileSync?: (path: string, encoding: 'utf-8') => string
  /** Custom function to check if file exists (optional) */
  existsSync?: (path: string) => boolean
}

/**
 * Loads and validates the codebuff.json configuration file.
 * @param options - Optional configuration for loading
 * @returns The parsed and validated configuration, or default config if no valid config exists
 */
export function loadCodebuffConfig(
  options: LoadCodebuffConfigOptions = {},
): CodebuffConfig {
  const {
    projectPath = process.cwd(),
    readFileSync: readFileSyncFn = readFileSync,
    existsSync: existsSyncFn = existsSync,
  } = options

  const configPathPrimary = path.join(projectPath, codebuffConfigFile)
  const configPathBackup = path.join(projectPath, codebuffConfigFileBackup)
  const configPath = existsSyncFn(configPathBackup)
    ? configPathBackup
    : existsSyncFn(configPathPrimary)
      ? configPathPrimary
      : null

  if (configPath === null) {
    return getDefaultConfig()
  }

  try {
    const jsoncContent = readFileSyncFn(configPath, 'utf-8')
    const parsedConfig = parseJsonc(jsoncContent)

    const result = CodebuffConfigSchema.safeParse(parsedConfig)

    if (!result.success) {
      return getDefaultConfig()
    }

    return result.data
  } catch {
    return getDefaultConfig()
  }
}

/**
 * Loads the raw codebuff.json configuration without validation.
 * Useful when you need to modify and save the config back.
 */
export function loadRawCodebuffConfig(
  options: LoadCodebuffConfigOptions = {},
): Partial<CodebuffConfig> {
  const {
    projectPath = process.cwd(),
    readFileSync: readFileSyncFn = readFileSync,
    existsSync: existsSyncFn = existsSync,
  } = options

  const configPathPrimary = path.join(projectPath, codebuffConfigFile)
  const configPathBackup = path.join(projectPath, codebuffConfigFileBackup)
  const configPath = existsSyncFn(configPathBackup)
    ? configPathBackup
    : existsSyncFn(configPathPrimary)
      ? configPathPrimary
      : null

  if (configPath === null) {
    return {}
  }

  const jsoncContent = readFileSyncFn(configPath, 'utf-8')
  return parseJsonc(jsoncContent)
}
