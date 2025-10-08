import { spawnSync, spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, promises as fs } from 'fs';
import path, { resolve, join } from 'path';
import { homedir } from 'os';
import { selectProject } from './project-selector.js';
import { getUserProjectQuestionsFile, getPackageRoot, getReportsDisplayPath, getActualReportsPath } from './config/user-paths.js';
import * as readline from 'readline';
import { loadEnvFile, drawBox, waitForEnterInInteractiveMode } from './utils/misc-utils.js';
import { logger } from './utils/compact-logger.js';
import { output } from './utils/output-manager.js';
import { OUTPUT_DIR, QUESTIONS_DIR, QUESTION_DATA_COMPILED_DIR } from './config/paths.js';
import { AGGREGATED_DIR_NAME } from './config/constants.js';
import { getUpdateNotification, checkForUpdates, getCurrentVersion } from './utils/update-checker.js';
import { performUpdate, showVersion } from './utils/update-installer.js';
import { getCliMenuItems, getInvokablePipelines, getActionByCommand, CliMenuItem, getPipeline } from './config/pipelines-and-actions.js';
import { PipelineExecutor, ExecutionOptions } from './utils/pipeline-executor.js';
import { validateAndLoadProject } from './utils/project-utils.js';
import { startServer, stopServer } from './utils/report-serve.js';

// Helper function to get absolute path to script files
function getScriptPath(scriptName: string): string {
  return path.join(getPackageRoot(), scriptName);
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

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

// Track the running server process
let serverProcess: ChildProcess | null = null;

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
      output.writeLine(colorize('\n💡 Press Ctrl+C to cancel this operation and return to menu', 'dim'));
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

// Helper function for non-critical menu operations (setup, config, etc)
async function runMenuOperation(args: string[], description?: string): Promise<boolean> {
  if (description) {
    output.writeLine(colorize(`\n${description}`, 'green'));
  }
  output.writeLine(colorize('💡 Press Ctrl+C to cancel and return to menu', 'dim'));

  try {
    return await runInterruptible(args, false); // false = don't show hint again
  } catch (error: any) {
    if (error.message === 'Operation cancelled') {
      output.writeLine(colorize('\n↩️ Cancelled, returning to menu...', 'yellow'));
      return false;
    }
    throw error;
  }
}

// Helper function for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to start the web server in background
async function startWebServer(): Promise<void> {
  if (serverProcess) {
    output.warn('⚠️  Server is already running');
    return;
  }

  try {
    // Start the server and get the actual port
    const port = await startServer();

    // Mark that we have a server running (using a dummy process for compatibility)
    serverProcess = {} as ChildProcess;
    // Store the actual port immediately so it's available for menu display
    (serverProcess as any).port = port;

    // Give server time to fully start then open browser
    await new Promise<void>(resolve => {
      setTimeout(() => {
        const url = `http://localhost:${port}`;
        const platform = process.platform;
        let openCmd: string;

        if (platform === 'darwin') {
          spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
        } else if (platform === 'win32') {
          // Windows requires special handling for the 'start' command
          spawn('cmd', ['/c', 'start', '', url], {
            detached: true,
            stdio: 'ignore',
            shell: false
          }).unref();
        } else {
          // Linux and other Unix-like systems
          spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
        }
        output.success(`\n✓ Browser opened at ${url}`);
        output.writeLine(colorize('Server is running in background..\n', 'dim'));
        resolve();
      }, 1500);
    });

    // Wait for user to press Enter before returning to menu
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('\nReports server is running in background. Press Enter to return to menu...', () => { rl.close(); resolve(null); }));
  } catch (error) {
    output.error(`❌ Failed to start server: ${error}`);
    serverProcess = null;
  }
}

// Helper function to stop the web server
function stopWebServer(): boolean {
  if (!serverProcess) {
    return false;
  }

  stopServer(); // Call real server stop function
  serverProcess = null;
  output.success('\n✓ Server stopped');
  return true;
}

// Helper function to find the latest date with enriched data
async function findLatestReportDate(project: string): Promise<string> {
  const questionsDir = QUESTIONS_DIR(project);
  
  try {
    const questionDirs = await fs.readdir(questionsDir, { withFileTypes: true });
    
    // Find the first non-aggregated question directory
    const firstQuestion = questionDirs
      .filter(d => d.isDirectory() && d.name !== AGGREGATED_DIR_NAME)
      .sort()[0];
    
    if (!firstQuestion) {
      return new Date().toISOString().split('T')[0];
    }
    
    // Check for data dates in the first question's data-compiled directory
    const dataCompiledDir = QUESTION_DATA_COMPILED_DIR(project, firstQuestion.name);
    
    try {
      const dateDirs = await fs.readdir(dataCompiledDir, { withFileTypes: true });
      const dates = dateDirs
        .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
        .map(d => d.name)
        .sort()
        .reverse();
      
      // Check each date to find one with enriched data
      for (const date of dates) {
        const dateDir = path.join(dataCompiledDir, date);
        const files = await fs.readdir(dateDir);
        const dataFile = files.find(f => f === `${date}-data.js`);
        if (dataFile) {
          // Check if the file has actual content (not empty)
          const filePath = path.join(dateDir, dataFile);
          const stats = await fs.stat(filePath);
          if (stats.size > 100) { // File should have substantial content
            return date;
          }
        }
      }
    } catch (error) {
      // No data-compiled directory found
    }
  } catch (error) {
    // Error reading questions directory
  }
  
  // Fallback to current date if no data found
  return new Date().toISOString().split('T')[0];
}

// Helper function to check if compiled data exists for a given date
async function hasCompiledData(project: string, date: string): Promise<boolean> {
  const questionsDir = QUESTIONS_DIR(project);
  
  try {
    const questionDirs = await fs.readdir(questionsDir, { withFileTypes: true });
    
    // Check if at least one question has compiled data
    for (const dirent of questionDirs) {
      if (dirent.isDirectory() && dirent.name !== AGGREGATED_DIR_NAME) {
        const compiledPath = path.join(
          QUESTION_DATA_COMPILED_DIR(project, dirent.name),
          date,
          `${date}-data.js.PROMPT-COMPILED.js`
        );
        
        try {
          const stats = await fs.stat(compiledPath);
          if (stats.size > 100) {
            return true;
          }
        } catch (error) {
          // File doesn't exist, continue checking
        }
      }
    }
  } catch (error) {
    // Error reading directory
  }
  
  return false;
}

function printHeader(): void {
  output.writeLine(colorize('\n🤖 AI Chat Watch', 'bright'));
  output.writeLine(colorize('   Track what AI chats say. More info: https://aichatwatch.com/ \n', 'dim'));

  // Show update notification if available
  const updateNotification = getUpdateNotification();
  if (updateNotification) {
    output.writeLine(colorize('   ' + updateNotification + '\n', 'yellow'));
  }
}

// Common wrapper for all pipeline functions when called from interactive menu
// This ensures consistent behavior and follows DRY principle
async function executePipeline(
  pipelineName: string,
  pipelineFunc: () => Promise<void>
): Promise<void> {
  try {
    // Execute the actual pipeline
    await pipelineFunc();

    // If running from interactive mode (but not as a pipeline step), wait for user
    // This ensures user can see the completion message before menu redraws
    await waitForEnterInInteractiveMode();
  } catch (error) {
    // Error handling is already done within individual pipeline functions
    // Just rethrow to maintain existing behavior
    throw error;
  }
}

async function showReportsFolder(): Promise<void> {
  const project = await selectProject();
  if (!project) {
    return;  // Will return to menu since showInteractiveMenu is called after this function
  }
  
  // Get the actual reports folder path using the proper function
  const reportsPath = getActualReportsPath(project);
  const displayPath = getReportsDisplayPath(project);
  const fileUrl = `file://${reportsPath}`;
  
  output.writeLine(colorize('\n📁 Reports Folder Location:', 'green'));
  output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
  
  output.writeLine('\n' + colorize('Path:', 'yellow'));
  output.writeLine(`  ${displayPath}\n`);
  
  output.writeLine(colorize('Full Path:', 'yellow'));
  output.writeLine(`  ${reportsPath}\n`);
  
  output.writeLine(colorize('Clickable Link:', 'yellow'));
  output.writeLine(`  ${colorize(fileUrl, 'cyan')}\n`);
  
  // Platform-specific instructions
  const platform = process.platform;
  if (platform === 'darwin') {
    output.writeLine(colorize('💡 To open on Mac:', 'dim'));
    output.writeLine('   • Hold ⌘ (Command) and click the link above');
    output.writeLine('   • Or copy and paste into Finder: Go → Go to Folder');
  } else if (platform === 'win32') {
    output.writeLine(colorize('💡 To open on Windows:', 'dim'));
    output.writeLine('   • Hold Ctrl and click the link above');
    output.writeLine('   • Or copy and paste into File Explorer');
  } else {
    output.writeLine(colorize('💡 To open:', 'dim'));
    output.writeLine('   • Copy and paste the path into your file manager');
  }
  
  output.writeLine('\n' + colorize('Alternative:', 'dim'));
  output.writeLine(`   Run this command: ${colorize(`open "${reportsPath}"`, 'bright')}` + ' (Mac)');
  output.writeLine(`   Run this command: ${colorize(`explorer "${reportsPath}"`, 'bright')}` + ' (Windows)\n');
  
  // Wait for user to press enter
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter to continue...', () => { rl.close(); resolve(null); }));
}

async function printHelp(): Promise<void> {
  printHeader();
  // output content of QUICK-START.md
  const quickStartPath = path.join(getPackageRoot(), 'QUICK-START.md');
  const quickStartContent = readFileSync(quickStartPath, 'utf8');
  output.writeLine(quickStartContent);
    // Wait for Enter in interactive mode
  await waitForEnterInInteractiveMode();
}

async function printLicense(): Promise<void> {
  printHeader();
  // output LICENSE.md file
  const licensePath = path.join(getPackageRoot(), 'LICENSE.md');
  const licenseContent = readFileSync(licensePath, 'utf8');  // eslint-disable-line @typescript-eslint/no-unsafe-call
  output.writeLine(licenseContent);

  output.writeLine(colorize('For more information:', 'dim'));
  output.writeLine(`${colorize('https://github.com/aichatwatch/aicw', 'blue')}\n`);
  await waitForEnterInInteractiveMode();
}

function checkEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for API keys
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
    errors.push('No API key found. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.');
  }
  
  // No need to check directory when installed as npm package
  
  return { isValid: errors.length === 0, errors };
}



function printStep(step: number, total: number, description: string): void {
  const progress = `[${step}/${total}]`;
  output.writeLine(`\n${colorize(progress, 'blue')} ${colorize(description, 'bright')}`);
}

function run(cmd: string[], options: { silent?: boolean } = {}): boolean {
  

  if (!options.silent) {
    logger.debug(`→ Running: ${cmd.join(' ')}`);
  }

  const res = spawnSync('node', cmd, { stdio: 'inherit' });
  
  if (res.status !== 0) {
    logger.error(`\n✗ Command failed with exit code ${res.status}`);
    return false;
  }
  
  return true;
}


async function showInteractiveMenu(showHeader: boolean = true): Promise<MenuState> {
  if (showHeader) {
    printHeader();
  }

  // Load environment to check API key
  await loadEnvFile();
  const hasApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (!hasApiKey) {
    output.writeLine(colorize('⚠️  No API key detected. Please set up your API key first.\n', 'yellow'));
    output.writeLine('1) ' + colorize('Setup API Key (Required)', 'bright'));
    output.writeLine('2) Exit\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Enter your choice (1-2): ', async (choice) => {
        rl.close();

        switch (choice.trim()) {
          case '1':
            await runMenuOperation(
              [getScriptPath('setup.js')],
              'Starting API key setup...'
            );
            // Always return to menu whether successful or cancelled
            resolve(MenuState.CONTINUE);
            break;
          case '2':
            output.writeLine('Goodbye!');
            resolve(MenuState.EXIT);
            break;
          default:
            console.error(colorize('\n✗ Invalid choice\n', 'red'));
            resolve(MenuState.CONTINUE);
        }
      });
    });
  }

  output.writeLine(colorize('Main Menu', 'bright'));
  output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));

  // Show update notification if available
  const updateNotification = getUpdateNotification();
  if (updateNotification) {
    output.writeLine('\n' + colorize(updateNotification, 'yellow'));
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
  }

  // Get all CLI menu items dynamically
  const allMenuItems = getCliMenuItems();

  // Organize items by type
  const pipelines = allMenuItems.filter(item => item.type === 'pipeline');
  const projectActions = allMenuItems.filter(item => item.type === 'action' && (item.category === 'project' || item.category === 'project-advanced'));
  const utilityActions = allMenuItems.filter(item => item.type === 'action' && item.category === 'utility');

  // Build menu items map (choice number -> menu item)
  const menuMap = new Map<string, CliMenuItem>();
  let choiceNum = 1;

  // Display Project Actions
  if (projectActions.length > 0) {
    output.writeLine('\n' + colorize('📂 Project Actions:', 'yellow'));
    for (const action of projectActions) {
      const numStr = String(choiceNum++);
      menuMap.set(numStr, action);
      const projectHint = action.requiresProject ? ' <project>' : '';
      output.writeLine(`${numStr}) ` + colorize(action.name, 'cyan') + `${projectHint} - ${action.description}`);
    }
  }

  // Display Pipelines
  if (pipelines.length > 0) {
    output.writeLine('\n' + colorize('➡ Project Pipelines:', 'yellow'));
    for (const pipeline of pipelines) {
      const numStr = String(choiceNum++);
      menuMap.set(numStr, pipeline);
      output.writeLine(`${numStr}) ` + colorize(pipeline.name, 'cyan') + ` - ${pipeline.description}`);
    }
  }  

  // Display Utility Actions
  if (utilityActions.length > 0) {
    output.writeLine('\n' + colorize('🔧 Utility Actions:', 'yellow'));
    for (const action of utilityActions) {
      const numStr = String(choiceNum++);
      menuMap.set(numStr, action);
      output.writeLine(`${numStr}) ` + colorize(action.name, 'cyan') + ` - ${action.description}`);
    }
  }

  // Special menu items
  output.writeLine('\n' + colorize('⚙️  More Options:', 'yellow'));

  const quickStartChoice = String(choiceNum++);
  output.writeLine(`${quickStartChoice}) ` + colorize('Quick Start', 'cyan') + ' - Show quick start guide');

  const licenseChoice = String(choiceNum++);
  output.writeLine(`${licenseChoice}) ` + colorize('License', 'cyan') + ' - Show License');

  output.writeLine('0) ' + colorize('Exit', 'cyan') + ' - Exit\n');

  // Display server status if running
  if (serverProcess) {
    const serverPort = (serverProcess as any).port || 8080;
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim'));
    output.writeLine(colorize('📍 Reports server running at: ', 'green') + colorize(`http://localhost:${serverPort}/`, 'bright'));
    output.writeLine(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim') + '\n');
  }

  const maxChoice = choiceNum - 1;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`Enter your choice (0-${maxChoice}): `, async (choice) => {
      rl.close();

      const choiceStr = choice.trim();

      // Handle exit
      if (choiceStr === '0') {
        if (serverProcess) {
          output.writeLine(colorize('\nStopping web server...', 'dim'));
          stopWebServer();
        }
        output.writeLine(colorize('\n👋 Thanks for using AI Chat Watch!', 'green'));
        output.writeLine('Goodbye!\n');
        resolve(MenuState.EXIT);
        return;
      }

      // Handle help
      if (choiceStr === quickStartChoice) {
        process.env.AICW_INTERACTIVE_MODE = 'true';
        await printHelp();
        resolve(MenuState.CONTINUE);
        return;
      }

      if(choiceStr === licenseChoice) {
        process.env.AICW_INTERACTIVE_MODE = 'true';
        await printLicense();
        resolve(MenuState.CONTINUE);
        return;
      }

      // Handle dynamic menu items
      const menuItem = menuMap.get(choiceStr);

      if (menuItem) {
        try {
          // Handle pipelines
          if (menuItem.type === 'pipeline') {
            output.writeLine(colorize(`\n🚀 ${menuItem.name}`, 'green'));
            output.writeLine(colorize(`📋 ${menuItem.description}\n`, 'dim'));

            const project = await selectProject();
            if (project) {
              const executor = new PipelineExecutor(project);
              await executor.execute(menuItem.id);

              // Wait for user to press Enter before returning to menu
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              await new Promise(resolve => rl.question('\nPress Enter to return to menu...', () => { rl.close(); resolve(null); }));
            }
          }
          // Handle actions
          else if (menuItem.type === 'action') {
            // Special handling for report server
            if (menuItem.id === 'report-serve') {
              output.writeLine(colorize(`\n⚙️  ${menuItem.name}`, 'green'));
              output.writeLine(colorize(`\n${menuItem.description}`, 'dim'));
              await startWebServer();
            } else {
              let project: string | null = null;

              // Get project if required
              if (menuItem.requiresProject) {
                output.writeLine(colorize(`\n📂 ${menuItem.name}`, 'green'));
                project = await selectProject();
                if (!project) {
                  output.writeLine(colorize('No project selected. Operation cancelled.', 'yellow'));
                  resolve(MenuState.CONTINUE);
                  return;
                }
              } else {
                output.writeLine(colorize(`\n⚙️  ${menuItem.name}`, 'green'));
              }

              // Execute action
              const action = getActionByCommand(menuItem.cliCommand);
              if (action) {
                const args = [getScriptPath(`${action.cmd}.js`)];
                if (project) args.push(project);

                await runMenuOperation(args, menuItem.description);
              }
            }
          }
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

// Main menu loop - runs continuously until user chooses to exit
async function runMenuLoop(): Promise<void> {
  let currentState = MenuState.MAIN;
  let isFirstRun = true;
  
  while (currentState !== MenuState.EXIT) {
    try {
      switch (currentState) {
        case MenuState.MAIN:
        case MenuState.CONTINUE:
          currentState = await showInteractiveMenu(isFirstRun);
          isFirstRun = false;
          break;
        default:
          currentState = MenuState.MAIN;
      }
    } catch (error) {
      // This is our safety net - log error and continue
      console.error('\n❌ An error occurred:', error instanceof Error ? error.message : error);
      output.writeLine('\n↩️  Returning to menu...\n');
      await waitForEnterInInteractiveMode();
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
    } else if (serverProcess) {
      // Stop the server if it's running
      stopWebServer();
      output.writeLine(colorize('\n↩️ Server stopped, returning to menu...', 'yellow'));
      // Don't exit - return to menu
    } else {
      // No operation running, exit normally
      process.exit(0);
    }
  });

  const [command, projectArg, ...args]: string[] = process.argv.slice(2);
  let project = projectArg;

  // Show interactive menu if no command
  if (!command) {
    await runMenuLoop();
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

  // Check environment
  const envCheck = checkEnvironment();
  if (!envCheck.isValid && command !== 'help' && command !== 'serve') {
    console.error(colorize('\n✗ Environment check failed:', 'red'));
    envCheck.errors.forEach(error => console.error(`  • ${error}`));
    console.error(colorize('\nRun "aicw setup" to configure the CLI.\n', 'dim'));
    return;
  }

  // For commands that need a project, allow interactive selection if not provided
  const noProjectCommands = ['help', 'setup', 'project', 'serve', 'version', 'update'];
  if (!noProjectCommands.includes(command) && !project) {
    printHeader();
    output.writeLine(colorize('Which project would you like to work with?', 'yellow'));
    const selectedProject = await selectProject();
    if (!selectedProject) {
      console.error(colorize('\n✗ No project selected. Come back when you\'re ready!', 'red'));
      return;
    }
    project = selectedProject;
  }

  if (project) {
    await validateAndLoadProject(project);  
  }

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

    const questionsFile = args.find(arg => !arg.startsWith('--'));

    // Extract --date argument if provided and pass it via environment variable
    const dateIndex = args.indexOf('--date');
    const targetDate = dateIndex !== -1 && args[dateIndex + 1] ? args[dateIndex + 1] : undefined;

    const executorOptions: ExecutionOptions = { questionsFile };
    if (targetDate) {
      executorOptions.env = { AICW_TARGET_DATE: targetDate };
    }

    const executor = new PipelineExecutor(project);
    const result = await executor.execute(pipeline.id, executorOptions);
    process.exit(result.success ? 0 : 1);
  }

  // Check if command is a CLI action
  const action = getActionByCommand(resolvedCommand);
  if (action) {
    printHeader();
    output.writeLine(colorize(`${action.name}`, 'cyan'));

    const scriptArgs = [getScriptPath(`${action.cmd}.js`)];
    if (action.requiresProject && project) {
      scriptArgs.push(project);
    }
    scriptArgs.push(...args);

    const success = run(scriptArgs);
    process.exit(success ? 0 : 1);
  }

  // SPECIAL COMMANDS
  switch (resolvedCommand) {
    case 'open':
    case 'folder':
      printHeader();
      await showReportsFolder();
      break;

    default:
      console.error(colorize(`\n✗ Oops! I don't know the command '${command}'`, 'red'));
      console.error(colorize('Try "aicw help" to see what I can do.\n', 'dim'));
      process.exit(1);
  }
}

main().catch(err => {
  console.error(colorize('\n✗ Unexpected error:', 'red'), err);
  // Don't exit - let global error handlers deal with it
});
