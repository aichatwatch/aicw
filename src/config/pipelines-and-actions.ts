/**
 * Central Pipeline Registry - SINGLE SOURCE OF TRUTH
 *
 * Tag-based pipeline system where each AppAction declares which pipelines it belongs to.
 *
 * Pipeline Tags:
 * - 'project-build': Full pipeline (fetch fresh data, extract, enrich, report)
 * - 'project-rebuild': Advanced - rebuild from existing answers (skip fetch)
 * - 'project-rebuild-report-only': Advanced - regenerate report only
 *
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * AppAction - Universal action that can be both a pipeline step and CLI command.
 */
export interface AppAction {
  /** Unique identifier */
  id: string;

  /** Script path relative to dist/ (without .js). Example: 'prepare-questions' or 'ee/enrich-calculate-influence' */
  cmd: string;

  /** Human-readable name */
  name: string;

  /** Description shown during execution */
  desc: string;

  /**
   * Pipeline tags - which pipelines include this action.
   * Tags: 'project-build', 'project-rebuild', 'project-report-only'
   */
  pipelines: string[];

  /** REQUIRED: Category for help display */
  category: 'utility' | 'project' | 'project-advanced';

  /** Optional: CLI command name (if this action can be run standalone) */
  cliCommand?: string;

  /** Optional: Whether CLI command requires a project argument */
  requiresProject?: boolean;
}

/** Complete pipeline definition */
export interface PipelineDefinition {
  /** Unique pipeline identifier */
  id: string;
  /** Display name for menu */
  name: string;
  /** Description shown in menu */
  description: string;
  /** Menu display order (lower = shown first) */
  order: number;    
  /** Pipeline category used to filter actions */
  category: string;
  /** Actions to execute in order */
  actions: AppAction[];
  /** Optional: CLI command that triggers this pipeline */
  cliCommand?: string;
}

// ============================================================================
// ALL APP ACTIONS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * All possible actions in the system.
 * Each action declares which pipelines it belongs to via pipelines.
 */
export const APP_ACTIONS: AppAction[] = [
  // ========================================================================
  // PIPELINE ACTIONS (Project Processing)
  // ========================================================================

  {
    id: 'cleanup-compiled-data',
    cmd: 'actions/cleanup-compiled-data',
    name: 'Cleanup: remove compiled data',
    desc: 'Removing compiled data (excepts answers)',
    pipelines: ['project-rebuild', 'project-build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'cleanup-orphaned-questions',
    cmd: 'actions/cleanup-orphaned-questions',
    name: 'Cleanup: remove orphaned questions',
    desc: 'Removing orphaned question folders',
    pipelines: ['project-rebuild', 'project-build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'prepare-questions',
    cmd: 'actions/prepare-questions',
    name: 'Prepare Questions',
    desc: 'Preparing questions from markdown',
    pipelines: ['project-build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'data-file-create',
    cmd: 'actions/data-file-create',
    name: 'Data file: prepare data files',
    desc: 'Data file: prepare data files',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },  

  {
    id: 'fetch-answers-ai',
    cmd: 'actions/fetch-answers-ai',
    name: 'Fetch Answers',
    desc: 'Fetching answers from AI models',
    pipelines: ['project-build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'extract-entities-prepare-prompt',
    cmd: 'actions/extract-entities-prepare-prompt',
    name: 'Extract entities: prepare prompts',
    desc: 'Extract entities: prepare prompts',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },  

  {
    id: 'extract-entities-ai',
    cmd: 'actions/extract-entities-ai',
    name: 'Extract Entities: extract entities',
    desc: 'Extract entities: extract entities',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  /*
  {
    id: 'action-stop',
    cmd: 'actions/action-stop',
    name: 'Debug: stop pipeline',
    desc: 'Stopping pipeline',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },
*/
  {
    id: 'extract-links',
    cmd: 'actions/extract-links',
    name: 'Extract Links',
    desc: 'Extracting links from original answer files',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },    


  {
    id: 'enrich-links-get-type',
    cmd: 'actions/enrich-links-get-type',
    name: 'Get Links Type',
    desc: 'Getting links type using patterns',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-links-get-type-ai',
    cmd: 'actions/enrich-links-get-type-ai',
    name: 'AI Link Type',
    desc: 'AI type for unclassified links',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'generate-link-types-array',
    cmd: 'actions/generate-link-types-array',
    name: 'Generate linkTypes secion in the data',
    desc: 'Generating linkTypes section in the data for use by get-link-type action',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-mentions',
    cmd: 'actions/enrich-calculate-mentions',
    name: 'Calculate Mentions',
    desc: 'Calculating entity mentions',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-appearance-order',
    cmd: 'actions/enrich-calculate-appearance-order',
    name: 'Calculate Appearance Order',
    desc: 'Calculating appearance order',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  
  {
    id: 'enrich-calculate-influence',
    cmd: 'actions/enrich-calculate-influence',
    name: 'Calculate Influence',
    desc: 'Calculating weighted influence',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-trends',
    cmd: 'actions/enrich-calculate-trends',
    name: 'Calculate Trends',
    desc: 'Calculating historical trends',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-mentions',
    cmd: 'actions/enrich-link-types-calculate-mentions',
    name: 'Calculate LinkTypes Mentions',
    desc: 'Calculating linkTypes mentions',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-appearance-order',
    cmd: 'actions/enrich-link-types-calculate-appearance-order',
    name: 'Calculate LinkTypes Appearance Order',
    desc: 'Calculating linkTypes appearance order',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-influence',
    cmd: 'actions/enrich-link-types-calculate-influence',
    name: 'Calculate LinkTypes Influence',
    desc: 'Calculating linkTypes influence',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  
  {
    id: 'enrich-link-types-calculate-trends',
    cmd: 'actions/enrich-link-types-calculate-trends',
    name: 'Calculate LinkTypes Trends',
    desc: 'Calculating linkTypes trends',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-generate-links-for-entities-ai',
    cmd: 'actions/enrich-generate-links-for-entities-ai',
    name: 'Find Entity URLs',
    desc: 'Finding website URLs for entities',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-generate-similar-for-entities-ai',
    cmd: 'actions/enrich-generate-similar-for-entities-ai',
    name: 'Generate Similar Terms',
    desc: 'Generating similar terms for better matching',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-generate-summary-ai',
    cmd: 'actions/enrich-generate-summary-ai',
    name: 'Generate AI Summary',
    desc: 'Generating AI summary',
    pipelines: ['project-build', 'project-rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-output-cleanup',
    cmd: 'actions/report-generate-output-cleanup',
    name: 'Cleanup: remove old report files',
    desc: 'Removing old report files for target date',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-answers-file',
    cmd: 'actions/report-generate-answers-file',
    name: 'Generate Answers File for use by report',
    desc: 'Generating answers file for use by report',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true
  },

  {
    id: 'report-generate',
    cmd: 'actions/report-generate',
    name: 'Report: generate',
    desc: 'Generating HTML report',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-project-navigation',
    cmd: 'actions/report-generate-project-navigation',
    name: 'Report: generate project navigation',
    desc: 'Generating project navigation',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-show-success-message',
    cmd: 'actions/report-generate-show-success-message',
    name: 'Report: generate success message',
    desc: 'Generating success message',
    pipelines: ['project-build', 'project-rebuild', 'project-rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  // ========================================================================
  // NON-PIPELINE ACTIONS (Utilities, Setup, etc.)
  // ========================================================================
  {
    id: 'setup',
    cmd: 'setup',
    name: 'Setup: setup API Key',
    desc: 'Configure API key for accessing AI models',
    pipelines: [], 
    category: 'utility',
    requiresProject: false,
  },

  {
    id: 'project-new',
    cmd: 'actions/project-new',
    name: 'Project: create new project',
    desc: 'Create a new project with AI-generated questions',
    pipelines: [],
    category: 'project',
    requiresProject: false,
  },

  {
    id: 'actions/check-models',
    cmd: 'check-models',
    name: 'Setup: check AI Models',
    desc: 'Test all AI models for deprecation',
    pipelines: [],
    
    category: 'utility',
    requiresProject: false,
  },

  {
    id: 'report-serve',
    cmd: 'utils/report-serve',
    name: 'Reports: run reports server',
    desc: 'Start web server to view reports in browser',
    pipelines: [],
    
    category: 'utility',
    requiresProject: false,
  },

  {
    id: 'report-compare',
    cmd: 'actions/report-compare',
    name: 'Reports: compare reports',
    desc: 'Compare reports across dates and analyze trends',
    pipelines: [],
    
    category: 'utility',
    requiresProject: true,
  },
];

// PIPELINE DEFINITIONS
export const PROJECT_PIPELINES: PipelineDefinition[] = [
  {
    id: 'pipeline-project-build',
    name: 'Project: full pipeline',
    description: 'get AI answers, analyze and generate report',
    order: 1,
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('project-build')),
  },

  {
    id: 'pipeline-project-rebuild',
    name: 'Project: rebuild project',
    description: 'rebuild report (no re-asking AI for answers)',
    order: 1,
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('project-rebuild')),
  },

  {
    id: 'pipeline-project-rebuild-report-only',
    name: 'Project: generate report (only)',
    description: 'create html report from existing data, no recalc',
    order: 2,
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('project-rebuild-report-only')),
  },
];


// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get action by ID
 */
export function getAction(id: string): AppAction | undefined {
  return APP_ACTIONS.find(a => a.id === id);
}

/**
 * Get action by CLI command name or alias
 */
export function getActionByCommand(command: string): AppAction | undefined {
  return APP_ACTIONS.find(a =>
    a.id === command
  );
}

/**
 * Get all actions with a specific pipeline tag
 */
export function getActionsByTag(tag: string): AppAction[] {
  return APP_ACTIONS.filter(a => a.pipelines.includes(tag));
}

/**
 * Get pipeline by ID
 */
export function getPipeline(id: string): PipelineDefinition | undefined {
  return PROJECT_PIPELINES.find(p => p.id === id);
}

/**
 * Get pipelines by category
 */
export function getPipelinesByCategory(category: 'utility' | 'project' | 'project-advanced'): PipelineDefinition[] {
  return PROJECT_PIPELINES
    .filter(p => p.actions.some(a => a.category === category))
    .sort((a, b) => a.order - b.order);
}

/**
 * Build alias map for fast CLI lookup
 */
export function getAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const action of APP_ACTIONS) {
    if (action.id) {
      map[action.id] = action.id;
    }
  }
  return map;
}

/**
 * Get all unique script paths
 */
export function getAllScriptPaths(): string[] {
  return Array.from(new Set(APP_ACTIONS.map(a => a.cmd))).sort();
}

/**
 * Get all script paths as filenames (with .js extension)
 */
export function getAllScriptFilenames(): string[] {
  return getAllScriptPaths().map(path => `${path}.js`);
}

/**
 * Get count of all unique scripts
 */
export function getScriptCount(): number {
  const paths = getAllScriptPaths();
  return paths.length;
}

/**
 * Get all CLI commands (actions that have cliCommand defined)
 */
export function getCliCommands(): AppAction[] {
  return APP_ACTIONS.filter(a => a.id);
}

/**
 * Get all CLI-invokable items (pipelines + actions with cliCommand)
 */
export interface CliMenuItem {
  type: 'pipeline' | 'action';
  id: string;
  name: string;
  description: string;
  cliCommand: string;
  category: string;
  order?: number;
  requiresProject?: boolean;
}

/**
 * Get all pipelines that have cliCommand (can be invoked from CLI)
 */
export function getInvokablePipelines(): PipelineDefinition[] {
  return PROJECT_PIPELINES.filter(p => p.id);
}

/**
 * Get all standalone actions with cliCommand (not part of pipelines, can be invoked from CLI)
 */
export function getInvokableActions(): AppAction[] {
  return APP_ACTIONS.filter(a => a.id && a.pipelines.length === 0);
}

/**
 * Get all CLI menu items (pipelines + standalone actions) organized by category
 */
export function getCliMenuItems(): CliMenuItem[] {
  const items: CliMenuItem[] = [];

  // Add invokable pipelines
  const pipelines = getInvokablePipelines();
  for (const pipeline of pipelines) {
    items.push({
      type: 'pipeline',
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      cliCommand: pipeline.id!,
      category: pipeline.category,
      order: pipeline.order,
      requiresProject: true, // Pipelines always require project
    });
  }

  // Add invokable standalone actions
  const actions = getInvokableActions();
  for (const action of actions) {
    items.push({
      type: 'action',
      id: action.id,
      name: action.name,
      description: action.desc,
      cliCommand: action.id!,
      category: action.category,
      requiresProject: action.requiresProject,
    });
  }

  return items;
}

/**
 * Get CLI menu items grouped by category
 */
export function getCliMenuByCategory(): Record<string, CliMenuItem[]> {
  const items = getCliMenuItems();
  const grouped: Record<string, CliMenuItem[]> = {
    utility: [],
    project: [],
    'project-advanced': [],
  };

  for (const item of items) {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  }

  // Sort by order within each category
  for (const category in grouped) {
    grouped[category].sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  return grouped;
}