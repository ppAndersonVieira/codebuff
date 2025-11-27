import { getDefaultConfig } from '@codebuff/common/json-config/default'
import { loadCodebuffConfig as loadCodebuffConfigFromCommon } from '@codebuff/common/json-config/parser'

import { getProjectRoot } from '../project-files'

import type { CodebuffConfig } from '@codebuff/common/json-config/constants'

let cachedConfig: CodebuffConfig | null = null

/**
 * Loads and validates the codebuff.json configuration file.
 * Results are cached for subsequent calls.
 */
export function loadCodebuffConfig(): CodebuffConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  let projectPath: string
  try {
    projectPath = getProjectRoot()
  } catch {
    cachedConfig = getDefaultConfig()
    return cachedConfig
  }

  cachedConfig = loadCodebuffConfigFromCommon({ projectPath })
  return cachedConfig
}

/**
 * Clear the cached config. Useful for testing or when config changes.
 */
export function clearCodebuffConfigCache(): void {
  cachedConfig = null
}
