import { spawn, ChildProcess } from 'child_process';
import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { getPackageRoot } from './config/user-paths.js';
import * as readline from 'readline';
import { loadEnvFile, drawBox, waitForEnterInInteractiveMode, getModuleNameFromUrl, createCleanReadline } from './utils/misc-utils.js';
import { logger } from './utils/compact-logger.js';
import { output } from './utils/output-manager.js';
import { getUpdateNotification, getCurrentVersion } from './utils/update-checker.js';
import { performUpdate, showVersion } from './utils/update-installer.js';
import { getCliMenuItems, getActionByCommand, CliMenuItem, getPipeline } from './config/pipelines-and-actions.js';
import { PipelineExecutor, ExecutionOptions, ExecutionResult } from './utils/pipeline-executor.js';
import { stopServer, isServerRunning, getServerPort } from './actions/utils/report-serve.js';
import { initializeUserDirectories } from './config/user-paths.js';
import { PipelineCriticalError } from './utils/pipeline-errors.js';
import { COLORS } from './utils/misc-utils.js';
import { AICW_GITHUB_URL } from './config/constants.js';
import { WaitForEnterMessageType, openInDefaultBrowser } from './utils/misc-utils.js';
const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// Menu state management to avoid recursive calls
enum MenuState {
  MAIN = 'main',
  ADVANCED = 'advanced',
  EXIT = 'exit',
  CONTINUE = 'continue'
}

// Track current child process for interrupt handling
let currentChildProcess: ChildProcess | null = null;

// Helper function for interruptible command execution
async function runInterruptible(
  args: string[],
  showHint: boolean = true,
  pipelineContext?: { currentStep: number, totalSteps: number }
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Show interrupt hint unless disabled
    if (showHint) {
      output.writeLine(colorize('\n💡 Press Ctrl+C to cancel operation and return to menu', 'dim'));
    }

    // Set environment variable to indicate we're running from interactive mode
    const env: any = { ...process.env, AICW_INTERACTIVE_MODE: 'true' };

    // Add pipeline context if provided
    if (pipelineContext) {
      env.AICW_PIPELINE_STEP = String(pipelineContext.currentStep);
      env.AICW_PIPELINE_TOTAL_STEPS = String(pipelineContext.totalSteps);
    }

    currentChildProcess = spawn('node', args, { stdio: 'inherit', env });

    currentChildProcess.on('exit', (code) => {
      currentChildProcess = null;
      if (code === 0) {
        resolve(true);
      } else if (code === null) {
        // Process was killed (SIGINT)
        reject(new Error('Operation cancelled'));
      } else {
        resolve(false);
      }
    });

    currentChildProcess.on('error', (err) => {
      currentChildProcess = null;
      reject(err);
    });
  });
}

// Helper function to stop the web server
function stopWebServer(): boolean {
  if (!isServerRunning()) {
    return false;
  }

  stopServer(); // Call real server stop function
  output.success('Server stopped');
  return true;
}

function printHeader(): void {
  const version = getCurrentVersion();
  output.writeLine(colorize(`\n🤖 AI Chat Watch ${version} - https://aichatwatch.com/ `, 'bright'));

  // Show update notification if available
  const updateNotification = getUpdateNotification();
  if (updateNotification) {
    output.writeLine(colorize('   ' + updateNotification + '\n', 'yellow'));
  }
}

async function printHelp(): Promise<void> {
  printHeader();
  // output content of QUICK-START.md
  const quickStartPath = path.join(getPackageRoot(), 'README.md');
  const quickStartContent = readFileSync(quickStartPath, 'utf8');
  output.writeLine(quickStartContent);

  // now also write the list of available pipelines
  output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
  const allPipelines = getCliMenuItems(false);
  output.writeLine(colorize('Available pipelines:\n', 'yellow'));
  
  // Group pipelines by category
  const grouped = new Map<string, typeof allPipelines>();
  for (const pipeline of allPipelines) {
    const category = pipeline.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(pipeline);
  }

  // Display pipelines grouped by category
  for (const [category, pipelines] of grouped) {
    output.writeLine(colorize(`➡ ${category.toUpperCase()}:`, 'cyan'));
    for (const pipeline of pipelines) {
      output.writeLine(`  ${colorize(`[${pipeline.id}] ${pipeline.name} - ${pipeline.description}`, 'dim')}`);
      output.writeLine(`  To run use: ${colorize(`aicw ${pipeline.id} <project-name>`, 'bright')}`);
      output.writeLine('');
    }
  }
  output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));

    // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_THE_MENU, true);
}

async function printLicense(): Promise<void> {
  printHeader();
  // output LICENSE.md file
  const licensePath = path.join(getPackageRoot(), 'LICENSE.md');
  const licenseContent = readFileSync(licensePath, 'utf8');  // eslint-disable-line @typescript-eslint/no-unsafe-call
  output.writeLine(licenseContent);

  output.writeLine(colorize('For more information:', 'dim'));
  output.writeLine(`${colorize(AICW_GITHUB_URL, 'blue')}\n`);
  await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_THE_MENU, true);
}

async function showDemoReportsUrl(): Promise<void> {
  printHeader();
  // output LICENSE.md file
  const demoReportsUrlPath = `https://aichatwatch.com/demo/reports/index.html`
  output.writeLine(colorize('Explore Latest demo reports here:', 'dim'));
  output.writeLine(`${colorize(demoReportsUrlPath, 'blue')}\n`);
  await openInDefaultBrowser(demoReportsUrlPath);
  await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_THE_MENU, true);
}
async function checkApiKeysArePresent(): Promise<boolean> {
  // Load environment to check API key
  await loadEnvFile();
  const hasApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (!hasApiKey) {
    output.writeLine('----!!!!!!!-------------------------');
    output.writeLine(colorize('⚠️  No API keys were set! Please run "Setup: setup API Key" first and then try again.\n', 'red'));
    output.writeLine('----!!!!!!!------------------------');
    return false;
  }  
  else { 
    return true
  };

}

async function showInteractiveMenu(showHeader: boolean = true, showAdvanced: boolean = false): Promise<MenuState> {
  if (showHeader) {
    printHeader();
  }
  // Show update notification if available
  const updateNotification = getUpdateNotification();
  if (updateNotification) {
    output.writeLine('\n' + colorize(updateNotification, 'yellow'));
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
  }

  // Get all CLI menu items dynamically
  const allMenuItems = getCliMenuItems(showAdvanced);

  // Separate normal and advanced pipelines
  const normalPipelines = allMenuItems.filter(p => p.type !== 'advanced');
  const advancedPipelines = allMenuItems.filter(p => p.type === 'advanced');

  // Build menu items map (choice number -> menu item)
  const menuMap = new Map<string, CliMenuItem>();
  let choiceNum = 1;

  // Display Normal Pipelines
  if (normalPipelines.length > 0) {
    output.writeLine('\n' + colorize('➡ Pipelines:', 'yellow'));
    for (const pipeline of normalPipelines) {
      const numStr = String(choiceNum++);
      menuMap.set(numStr, pipeline);
      output.writeLine(`[${numStr}] ` + colorize(pipeline.name, 'cyan') + ` - ${pipeline.description}`);
    }
  }

  // Display Advanced Pipelines with 999 prefix
  if (advancedPipelines.length > 0 && showAdvanced) {
    output.writeLine('\n' + colorize('🔧 ADVANCED PIPELINES:', 'yellow'));
    for (const pipeline of advancedPipelines) {
      const numStr = String(1000+choiceNum++);
      menuMap.set(numStr, pipeline);
      output.writeLine(`[${numStr}] ` + colorize(pipeline.name, 'cyan') + ` - ${pipeline.description}`);
    }
  }  

  // Special menu items
  output.writeLine('\n' + colorize('⚙️  More:', 'yellow'));

  const demoReportsChoice = String(choiceNum++);
  output.writeLine(`[${demoReportsChoice}] ` + colorize('View Demo Reports', 'cyan') + ' - View Demo Reports');



  const helpChoice = String(choiceNum++);
  output.writeLine(`[${helpChoice}] ` + colorize('Help', 'cyan') + ' - Show Help');

  const licenseChoice = String(choiceNum++);
  output.writeLine(`[${licenseChoice}] ` + colorize('License', 'cyan') + ' - Show License');

  output.writeLine('[0] ' + colorize('Exit', 'cyan') + ' - Exit\n');

  // Display server status if running
  if (isServerRunning()) {
    const serverPort = getServerPort() || 8080;
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
    output.writeLine(colorize('📍 Reports server running at: ', 'green') + colorize(`http://localhost:${serverPort}/`, 'bright'));
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim') + '\n');
  }

  const maxChoice = choiceNum - 1;
  const rl = createCleanReadline();

  return new Promise((resolve) => {
    rl.question(`Enter your choice (0-${maxChoice}): `, async (choice) => {
      rl.close();
      process.stdin.pause();

      const choiceStr = choice.trim();

      // Handle exit
      if (choiceStr === '0') {
        if (isServerRunning()) {
          output.writeLine(colorize('\nStopping web server...', 'dim'));
          stopWebServer();
        }
        const version = getCurrentVersion();
        output.writeLine(colorize(`\nBye! 👋 Thanks for using AI Chat Watch! ${version}`, 'green'));
        resolve(MenuState.EXIT);
        return;
      }

      if(choiceStr === helpChoice) {        
        await printHelp();
        resolve(MenuState.CONTINUE);
        return;
      }

      if(choiceStr === licenseChoice) {
        await printLicense();
        resolve(MenuState.CONTINUE);
        return;
      }

      if(choiceStr === demoReportsChoice) {
        await showDemoReportsUrl();
        resolve(MenuState.CONTINUE);
        return;
      }

      // Handle dynamic menu items
      const menuItem = menuMap.get(choiceStr);

      if (menuItem) {
        try {
          // Handle pipelines
          output.writeLine(colorize(`\n🚀 ${menuItem.name}`, 'green'));
          output.writeLine(colorize(`📋 ${menuItem.description}\n`, 'dim'));

          await executePipelineForMenuItem(menuItem.id);

          await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_THE_MENU, true);

        } catch (error: any) {
          output.writeLine(colorize(`\n✗ Error: ${error.message}`, 'red'));
        }

        resolve(MenuState.CONTINUE);
        return;
      }

      // Invalid choice
      console.error(colorize('\n✗ Invalid choice\n', 'red'));
      resolve(MenuState.CONTINUE);
    });
  });
}

async function executePipelineForMenuItem(pipelineId: string, project?: string): Promise<ExecutionResult> {

  // Initialize user directories on first run (moved from post-install)
  try {
    initializeUserDirectories();  
  } catch (error) {
    logger.error(`Warning: Could not create user directories: ${error.message}`);
    throw new PipelineCriticalError('Could not create user directories', 
      CURRENT_MODULE_NAME,
      error
    );
  }

  const pipeline = getPipeline(pipelineId);

  if(pipeline.requiresApiKeys) {
    // for command line mode before executing a pipeline always check for api keys
    // check if requried API keys are set
    if (!await checkApiKeysArePresent()) {
      // if no api keys are set, wait for user input and return back to the caller
      return { success: false, completedSteps: 0, totalSteps: 0, duration: 1 } as ExecutionResult;
    }
  }

  const executor = new PipelineExecutor(''); // empty project means it will show project selector if needed
  const executionOptions: ExecutionOptions = { project: project || '' };
  // run the pipeline
  const executionResult: ExecutionResult = await executor.execute(pipelineId, executionOptions);

  // only run next pipeline if the current pipeline was successful
  let runNextPipeline = executionResult.success && pipeline.nextPipeline && pipeline.nextPipeline.length > 0;

  if (runNextPipeline) {

      const nextPipeline = getPipeline(pipeline.nextPipeline);
      // run the next pipeline
      logger.log('--------------------------------');
      logger.log(`IMPORTANT: Next we will run the pipeline "${pipeline.nextPipeline}" (parent: "${pipelineId}") for the project "${executionResult.project}"
        \nDescription of the next pipeline: ${nextPipeline.description}`);
      logger.log('--------------------------------');
      runNextPipeline = await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_CONTINUE, true);
  }
  if (runNextPipeline) {
      const ExecutionResultNext: ExecutionResult = await executePipelineForMenuItem(pipeline.nextPipeline, executionResult.project);
      if (!ExecutionResultNext.success) {
        logger.error(`Failed to run the pipeline "${pipeline.nextPipeline}" (parent: "${pipelineId}") for project "${executionResult.project}"
        \nPlease try again by selecting the pipeline "${pipeline.nextPipeline}" from the main menu.
          `);
      }
      return ExecutionResultNext;
  }
  else {
    // if no pipeline to run next, wait for user input and return back to the caller
    return executionResult;
  }
}

// Main menu loop - runs continuously until user chooses to exit
async function runMenuLoop(showAdvanced: boolean = false): Promise<void> {
  let currentState = MenuState.MAIN;
  let isFirstRun = true;

  while (currentState !== MenuState.EXIT) {
    try {
      switch (currentState) {
        case MenuState.MAIN:
        case MenuState.CONTINUE:
          currentState = await showInteractiveMenu(isFirstRun, showAdvanced);
          isFirstRun = false;
          break;
        default:
          currentState = MenuState.MAIN;
      }
    } catch (error) {
      // This is our safety net - log error and continue
      console.error('\n❌ An error occurred:', error instanceof Error ? error.message : error);
      output.writeLine('\n↩️  Returning to menu...\n');
      await waitForEnterInInteractiveMode(WaitForEnterMessageType.PRESS_ENTER_TO_THE_MENU, true);
      currentState = MenuState.MAIN;
      isFirstRun = false; // Don't show header after errors
    }
  }

  process.exit(0);
}

// Main execution
async function main(): Promise<void> {
  // Setup interrupt handler for graceful cancellation
  process.on('SIGINT', () => {
    if (currentChildProcess) {
      // Kill child process, which will trigger the rejection in runInterruptible
      currentChildProcess.kill('SIGINT');
      // Don't exit - let the error handling return to menu
    } else if (isServerRunning()) {
      // Stop the server if it's running
      stopWebServer();
      output.writeLine(colorize('\n↩️ Server stopped, returning to menu...', 'yellow'));
      // Don't exit - return to menu
    } else {
      // No operation running, exit normally
      process.exit(0);
    }
  });

  const allArgs = process.argv.slice(2);
  const showAdvanced = allArgs.includes('--advanced');

  const [command, projectArg, ...args]: string[] = allArgs;
  let project = projectArg;

  // Show interactive menu if no command or --advanced flag only
  if (!command || command === '--advanced') {
    await runMenuLoop(showAdvanced);
    return;
  }
  
  // Show help if requested
  if (command === 'help' || command === '--help' || command === '-h') {
    await printHelp();
    return;
  }

  // Show license information
  if (command === 'license' || command === '--license') {
    await printLicense();
    return;
  }

  // Show version information
  if (command === 'version' || command === '--version' || command === '-v') {
    showVersion();
    return;
  }

  // Handle update command
  if (command === 'update' || command === 'u') {
    printHeader();
    await performUpdate();
    return;
  }
  // Load environment variables before checking environment
  await loadEnvFile();
  // Map command aliases
  const commandAliases: Record<string, string> = {
    'u': 'update',
    '-v': 'version',
    '--version': 'version'
  };
  
  // Resolve command alias
  const resolvedCommand = commandAliases[command] || command;

  // Check if command is a pipeline
  const pipeline = getPipeline(resolvedCommand);
  if (pipeline) {
    printHeader();
    output.writeLine(colorize(`\n🚀 ${pipeline.name}`, 'green'));
    output.writeLine(colorize(`📋 ${pipeline.description}\n`, 'dim'));

    // Extract --date argument if provided and pass it via environment variable
    const dateIndex = args.indexOf('--date');
    const targetDate = dateIndex !== -1 && args[dateIndex + 1] ? args[dateIndex + 1] : undefined;

    const executorOptions: ExecutionOptions = {  };
    if (targetDate) {
      executorOptions.env = { AICW_TARGET_DATE: targetDate };
    }

    // for command line mode before executing a pipeline always check for api keys
    // check if requried API keys are set
    if (!await checkApiKeysArePresent()) {
      process.exit(1);
    }

    const executor = new PipelineExecutor(project);
    const result = await executor.execute(pipeline.id, executorOptions);
    process.exit(result.success ? 0 : 1);
  }

  // SPECIAL COMMANDS
  switch (resolvedCommand) {
    default:
      console.error(colorize(`\n✗ Oops! I don't know the command or a pipeline "${command}"`, 'red'));
      console.error(colorize(`Try "aicw help" to see what I can do.`, 'dim'));
      process.exit(1);
  }
}

main().catch(err => {
  console.error(colorize('\n✗ Unexpected error:', 'red'), err);
  // Don't exit - let global error handlers deal with it
});
