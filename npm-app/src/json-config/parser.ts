import { type CodebuffConfig } from '@codebuff/common/json-config/constants'
import {
  loadCodebuffConfig as loadCodebuffConfigFromCommon,
  loadRawCodebuffConfig as loadRawCodebuffConfigFromCommon,
  parseJsonc,
} from '@codebuff/common/json-config/parser'

import { getProjectRoot } from '../project-files'

// Re-export parseJsonc for any existing consumers
export { parseJsonc }

/**
 * Loads and validates the configuration file from the project directory.
 * @returns The parsed and validated configuration, or default config if no valid config exists
 */
export function loadCodebuffConfig(): CodebuffConfig {
  const projectPath = getProjectRoot()
  return loadCodebuffConfigFromCommon({ projectPath })
}

export function loadRawCodebuffConfig(): Partial<CodebuffConfig> {
  const projectPath = getProjectRoot()
  return loadRawCodebuffConfigFromCommon({ projectPath })
}
