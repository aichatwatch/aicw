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

  /** Script path relative to dist/ (without .js). Example: 'prepare-folders' or 'ee/enrich-calculate-influence' */
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

  /* optional: whether the action requires a pipe to return the project name or another string to the pipeline */
  requiresConsolePipeReturn?: boolean;

  /** Optional: Run action directly in same process instead of spawning child (for long-running services) */
  runDirectly?: boolean;
}

/** Complete pipeline definition */
export interface PipelineDefinition {
  /** Unique pipeline identifier */
  id: string;
  /** Display name for menu */
  name: string;
  /** Description shown in menu */
  description: string;
  /** Pipeline category used to filter actions */
  category: string;
  /** Actions to execute in order */
  actions: AppAction[];
  /** Optional: CLI command that triggers this pipeline */
  cliCommand?: string;
  /* optional: next step pipeline to run after this action */
  nextPipeline?: string;
  /** Optional: whether the pipeline requires full configuration */
  requiresApiKeys?: boolean;
  /** Optional: pipeline type (e.g., "advanced") - advanced pipelines shown only with --advanced flag */
  type?: string;
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
    id: 'project-new',
    cmd: 'actions/project-new',
    name: 'Project: create new project',
    desc: 'Create a new project with AI-generated questions',
    pipelines: ['new'],
    category: 'project',
    requiresProject: false,
    // requires special mode where it returns the project name to the pipeline
    // because it creates a new project!
    requiresConsolePipeReturn: true
  },

  {
    id: 'project-new-prepare-folders',
    cmd: 'actions/project-new-prepare-folders',
    name: 'Prepare Questions',
    desc: 'Preparing questions from questions.md file',
    pipelines: [
      'new', 
      'rebuild', 
      'build'
    ],
    category: 'project',
    requiresProject: true
  },


  {
    id: 'project-cleanup-compiled-data',
    cmd: 'actions/project-cleanup-compiled-data',
    name: 'Cleanup: remove compiled data',
    desc: 'Removing compiled data (excepts answers)',
    pipelines: ['rebuild', 'build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'project-data-file-create',
    cmd: 'actions/project-data-file-create',
    name: 'Data file: prepare data files',
    desc: 'Data file: prepare data files',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },  

  {
    id: 'fetch-answers-ai',
    cmd: 'actions/fetch-answers-ai',
    name: 'Fetch Answers',
    desc: 'Fetching answers from AI models',
    pipelines: ['build'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'transform-answers-to-md',
    cmd: 'actions/transform-answers-to-md',
    name: 'Transform Answers to Markdown',
    desc: 'Transform answer.json files to enhanced answer.md with full citations',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'extract-entities-prepare-prompt',
    cmd: 'actions/extract-entities-prepare-prompt',
    name: 'Extract entities: prepare prompts',
    desc: 'Extract entities: prepare prompts',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },  

  {
    id: 'extract-entities-ai',
    cmd: 'actions/extract-entities-ai',
    name: 'Extract Entities: extract entities',
    desc: 'Extract entities: extract entities',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-get-source-links-for-entities',
    cmd: 'actions/enrich-get-source-links-for-entities',
    name: 'Get Source Links for Entities',
    desc: 'Extracting source links from citations for entities',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  /*
  {
    id: 'action-stop',
    cmd: 'actions/action-stop',
    name: 'Debug: stop pipeline',
    desc: 'Stopping pipeline',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },
*/
  {
    id: 'extract-links',
    cmd: 'actions/extract-links',
    name: 'Extract Links',
    desc: 'Extracting links from original answer files',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },    


  {
    id: 'enrich-links-get-type',
    cmd: 'actions/enrich-links-get-type',
    name: 'Get Links Type',
    desc: 'Getting links type using patterns',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-links-get-type-ai',
    cmd: 'actions/enrich-links-get-type-ai',
    name: 'AI Link Type',
    desc: 'AI type for unclassified links',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'generate-link-types-array',
    cmd: 'actions/generate-link-types-array',
    name: 'Generate linkTypes secion in the data',
    desc: 'Generating linkTypes section in the data for use by get-link-type action',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'generate-link-domains-array',
    cmd: 'actions/generate-link-domains-array',
    name: 'Generate linkDomains section in the data',
    desc: 'Generating linkDomains section in the data',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-mentions',
    cmd: 'actions/enrich-calculate-mentions',
    name: 'Calculate Mentions',
    desc: 'Calculating entity mentions',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-appearance-order',
    cmd: 'actions/enrich-calculate-appearance-order',
    name: 'Calculate Appearance Order',
    desc: 'Calculating appearance order',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  
  {
    id: 'enrich-calculate-influence',
    cmd: 'actions/enrich-calculate-influence',
    name: 'Calculate Influence',
    desc: 'Calculating weighted influence',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-calculate-trends',
    cmd: 'actions/enrich-calculate-trends',
    name: 'Calculate Trends',
    desc: 'Calculating historical trends',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-mentions',
    cmd: 'actions/enrich-link-types-calculate-mentions',
    name: 'Calculate LinkTypes Mentions',
    desc: 'Calculating linkTypes mentions',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-appearance-order',
    cmd: 'actions/enrich-link-types-calculate-appearance-order',
    name: 'Calculate LinkTypes Appearance Order',
    desc: 'Calculating linkTypes appearance order',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-types-calculate-influence',
    cmd: 'actions/enrich-link-types-calculate-influence',
    name: 'Calculate LinkTypes Influence',
    desc: 'Calculating linkTypes influence',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-domains-calculate-mentions',
    cmd: 'actions/enrich-link-domains-calculate-mentions',
    name: 'Calculate LinkDomains Mentions',
    desc: 'Calculating linkDomains mentions',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'enrich-link-domains-calculate-influence',
    cmd: 'actions/enrich-link-domains-calculate-influence',
    name: 'Calculate LinkDomains Influence',
    desc: 'Calculating linkDomains influence',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },  
  
  {
    id: 'enrich-link-types-calculate-trends',
    cmd: 'actions/enrich-link-types-calculate-trends',
    name: 'Calculate LinkTypes Trends',
    desc: 'Calculating linkTypes trends',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },
  {
    id: 'enrich-generate-links-for-entities',
    cmd: 'actions/enrich-generate-links-for-entities',
    name: 'Find Entity URLs',
    desc: 'Finding website URLs for entities',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },

/*
  {
    id: 'enrich-generate-links-for-entities-ai',
    cmd: 'actions/enrich-generate-links-for-entities-ai',
    name: 'Find Entity URLs using AI',
    desc: 'Finding website URLs for entities using AI',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },
*/
/* // excluding generating similar terms for entities as it is not useful and takes too long to process
  {
    id: 'enrich-generate-similar-for-entities-ai',
    cmd: 'actions/enrich-generate-similar-for-entities-ai',
    name: 'Generate Similar Terms',
    desc: 'Generating similar terms for better matching',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },
*/

/*
// excluded from all pipelines, takes too long to process and generally not useful
  {
    id: 'enrich-generate-summary-ai',
    cmd: 'actions/enrich-generate-summary-ai',
    name: 'Generate AI Summary',
    desc: 'Generating AI summary',
    pipelines: ['build', 'rebuild'],
    category: 'project',
    requiresProject: true,
  },
*/
  {
    id: 'report-generate-output-cleanup',
    cmd: 'actions/report-generate-output-cleanup',
    name: 'Cleanup: remove old report files',
    desc: 'Removing old report files for target date',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-answers-file',
    cmd: 'actions/report-generate-answers-file',
    name: 'Generate Answers File for use by report',
    desc: 'Generating answers file for use by report',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true
  },

  {
    id: 'report-generate',
    cmd: 'actions/report-generate',
    name: 'Report: generate',
    desc: 'Generating HTML report',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-project-navigation',
    cmd: 'actions/report-generate-project-navigation',
    name: 'Report: generate project navigation',
    desc: 'Generating project navigation',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  {
    id: 'report-generate-show-success-message',
    cmd: 'actions/report-generate-show-success-message',
    name: 'Report: generate success message',
    desc: 'Generating success message',
    pipelines: ['build', 'rebuild', 'rebuild-report-only'],
    category: 'project',
    requiresProject: true,
  },

  // ========================================================================
  // (Utilities, Setup, etc.)
  // ========================================================================
  {
    id: 'setup',
    cmd: 'setup',
    name: 'Setup: setup API Key',
    desc: 'Configure API keys for accessing AI models',
    pipelines: ['setup-api-key'], 
    category: 'utility',
    requiresProject: false,
  },

  
  {
    id: 'actions/check-models',
    cmd: 'check-models',
    name: 'Setup: check AI Models',
    desc: 'Test all AI models for deprecation',
    pipelines: ['check-models'],  
    category: 'utility',
    requiresProject: false,
  },

  {
    id: 'report-serve',
    cmd: 'actions/utils/report-serve',
    name: 'Reports: run reports server',
    desc: 'Start web server to view reports in browser',
    pipelines: ['report-serve'],
    category: 'utility',
    requiresProject: false,
    runDirectly: true,
  },

  {
    id: 'show-user-data-location',
    cmd: 'actions/utils/show-user-data-location',
    name: 'Utility: show user data folders location',
    desc: 'Show user data folder location',
    pipelines: ['show-user-data-location'],    
    category: 'utility',
    requiresProject: false,
  },  
/*
  {
    id: 'report-compare',
    cmd: 'actions/report-compare',
    name: 'Reports: compare reports',
    desc: 'Compare reports across dates and analyze trends',
    pipelines: [],
    
    category: 'utility',
    requiresProject: true,
  },
  */
];

// PIPELINE DEFINITIONS
export const PROJECT_PIPELINES: PipelineDefinition[] = [

  {
    id: 'new',
    name: 'Project: new project',
    description: 'create a new project',
    
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('new')),
    nextPipeline: 'build',
    requiresApiKeys: false
  },

  {
    id: 'build',
    name: 'Project: full pipeline',
    description: 'gets AI answers for today, analyzes data and generates report',
    
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('build')),
    requiresApiKeys: true
  },

  {
    id: 'rebuild',
    name: 'Project: rebuild project',
    description: 'rebuilds report (may use AI to analyze data if not cached)',    
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('rebuild')),
    requiresApiKeys: true
  },

  {
    id: 'rebuild-report-only',
    name: 'Project: generate report (only)',
    description: 'creates report from existing data (answers and citations), no AI is used',

    category: 'project',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('rebuild-report-only')),
    requiresApiKeys: true
  },

  {
    id: 'transform-answers',
    name: 'Advanced: regenerate answer.md from answer.json',
    description: 'internal use: transforms answer.json files to enhanced answer.md with full citations',
    category: 'project',
    actions: APP_ACTIONS.filter(a => a.id === 'transform-answers-to-md'),
    type: 'advanced',
    // do not require API keys for this action
    requiresApiKeys: false
  },
];

export const UTILITY_PIPELINES: PipelineDefinition[] = [

  {
    id: 'report-serve',
    name  : 'Utility: start reports server',
    description: 'starts web server to view reports in browser locally',    
    category: 'utility',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('report-serve')),
    // do not require API keys for this action
    requiresApiKeys: false
  },

  {
    id: 'show-user-data-location',
    name: 'Utility: show user data location',
    description: 'shows user data location',    
    category: 'utility',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('show-user-data-location')),
    // do not require API keys for this action
    requiresApiKeys: false
  },

  {
    id: 'check-models',
    name: 'Utility: check AI Models',
    description: 'checks all AI Models for deprecation',    
    category: 'utility',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('check-models')),
  },

  {
    id: 'setup-api-key',
    name: 'Setup: setup API Key',
    description: 'configures API keys for accessing AI models',    
    category: 'utility',
    actions: APP_ACTIONS.filter(a => a.pipelines.includes('setup-api-key')),
    //nextPipeline: 'new',
    // do not require API keys for this action
    requiresApiKeys: false
  },  
];

export const ALL_PIPELINES: PipelineDefinition[] = [
  ...PROJECT_PIPELINES,
  ...UTILITY_PIPELINES,
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
  return ALL_PIPELINES.find(p => p.id === id);
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
  id: string;
  name: string;
  description: string;
  cliCommand: string;
  category: string;
  requiresProject?: boolean;
  nextPipeline?: string;
  type?: string;
}


/**
 * Get all CLI menu items (pipelines + standalone actions) organized by category
 * @param showAdvanced - Include advanced pipelines (default: false)
 */
export function getCliMenuItems(showAdvanced: boolean = false): CliMenuItem[] {
  const items: CliMenuItem[] = [];

  // Add invokable pipelines
  const pipelines = ALL_PIPELINES.filter(p => {
    // Filter out advanced pipelines unless showAdvanced is true
    if (p.type === 'advanced' && !showAdvanced) {
      return false;
    }
    return true;
  });

  for (const pipeline of pipelines) {
    items.push({
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      cliCommand: pipeline.id!,
      category: pipeline.category,
      requiresProject: true, // Pipelines always require project
      nextPipeline: pipeline.nextPipeline,
      type: pipeline.type,
    });
  }

  return items;
}
