import fs from 'fs';
import { RETRY_CONFIG as PATHS_RETRY_CONFIG } from '../config/paths.js';
import { loadAllModels, loadAllAIPresets, getAIPreset, getAIAIPresetWithModels, getAIPresetNames, AIPreset, AIPresetWithModels } from '../ai-preset-manager.js';

export interface ModelConfig {
  /** Model id for use inside JS code and report
   * must be unique and use only
   * lowercase letters, numbers and underscore!
   **/
  id: string;
  /** Model name to pass to the API */
  model: string;
  /** Display name for the model in reports */
  display_name: string;
  /** URL for the model's page/documentation */
  url: string;
  /** Base URL for the API endpoint */
  api_url: string;
  /** Environment variable holding the API key */
  api_key_env: string;
  /** Tags for grouping (space-separated) */
  tags?: string;
  /** Estimated active users per month for calculating influence */
  estimated_mau?: number;
  /** Creation date */
  created_at?: string;
  /** Last update date */
  updated_at?: string;

  // additional parameters to pass to the API if available
  extra_body?: []; 
  // target model id if this model is an alias
  targetModelId?: string;
}

export function getCfgShortInfo(cfg: ModelConfig){
  return `[cfg.id="${cfg.id}" ${cfg.targetModelId ? '(alias)': ''}, cfg.model="${cfg.model}]"`;
}


/** Re-export retry configuration from paths */
export const RETRY_CONFIG = PATHS_RETRY_CONFIG;

/** Re-export ai_preset types and functions */
export { AIPreset, AIPresetWithModels, getAIPreset, getAIAIPresetWithModels, loadAllAIPresets, getAIPresetNames };
