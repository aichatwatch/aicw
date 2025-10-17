import { promises as fs } from 'fs';
import path, { join } from 'path';
import { createInterface } from 'readline';
import { colorize,  waitForEnterInInteractiveMode,  writeFileAtomic } from '../utils/misc-utils.js';
import { ModelConfig, loadAllAIPresets, getAIAIPresetWithModels } from '../utils/model-config.js';
import { PROJECT_DIR } from '../config/paths.js';
import { getProjectDisplayPath, getPackageRoot, getUserProjectQuestionsFile, getUserProjectConfigFile } from '../config/user-paths.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { USER_QUESTION_TEMPLATES_DIR } from '../config/user-paths.js';
import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

// Custom error for user cancellation/navigation
class UserCancelledError extends Error {
  constructor(message = 'User cancelled') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

interface ProjectSetupConfig {
  projectName: string;
  display_name: string;
  description: string;
  questions: string[];
  ai_preset: string;    
}

import { validateOrThrow } from '../utils/validation.js';
import { validateProjectName, sanitizeProjectName, ModelType } from '../utils/project-utils.js';
import { DEFAULT_PRESET_NAME } from '../ai-preset-manager.js';
import { PipelineCriticalError } from '../utils/pipeline-errors.js';

function question(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ask a question with the ability to cancel by pressing Enter twice
 * First Enter shows confirmation prompt, second Enter throws UserCancelledError
 */
async function questionWithCancelOption(prompt: string, cancelMessage: string = 'Press Enter again to go back, or type to continue: '): Promise<string> {
  while (true) {
    const answer = await question(prompt);

    if (answer === '') {
      // First Enter - ask for confirmation
      const confirm = await question(cancelMessage);
      if (confirm === '') {
        // Second Enter - cancel confirmed
        throw new UserCancelledError();
      } else {
        // User typed something, use it as the answer
        return confirm;
      }
    } else {
      // Valid answer provided
      return answer;
    }
  }
}

/**
 * Ask a Y/n or y/N confirmation question
 * Returns true for yes, false for no
 */
async function confirmAction(prompt: string, defaultYes: boolean = true): Promise<boolean> {
  const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
  const answer = await question(prompt + suffix);

  if (answer === '') {
    return defaultYes;
  }

  return answer.toLowerCase() === 'y';
}

interface QuestionTemplate {
  name: string;
  display_name: string;
  description: string;
  questions: string[];
}

async function loadQuestionTemplates(): Promise<QuestionTemplate[]> {
  const templates: QuestionTemplate[] = [];

  try {
    const files = await fs.readdir(USER_QUESTION_TEMPLATES_DIR);  
    const templateFiles = files.filter(f => f.endsWith('.md'));

    for (const file of templateFiles) {
      const name = file.replace('.md', '');
      const display_name = name.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');

      // Load template content
      const questionsPath = join(USER_QUESTION_TEMPLATES_DIR, file);
      const content = await fs.readFile(questionsPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Separate description (lines starting with #) from questions
      const descriptionLines = lines.filter(line => line.trim().startsWith('#'));
      const questions = lines.filter(line => !line.trim().startsWith('#'));

      // Combine description lines, removing the # prefix
      const description = descriptionLines.length > 0
        ? descriptionLines.map(line => line.replace(/^#\s*/, '')).join(' ').trim()
        : `Questions about ${display_name}`;

      templates.push({ name, display_name, description, questions });
    }
  } catch (error) {
    logger.error('Failed to load question templates');
    console.error(error);
  }

  return templates;
}

async function selectQuestionTemplate(subject: string): Promise<QuestionTemplate> {
  const templates = await loadQuestionTemplates();

  if (templates.length === 0) {
    throw new PipelineCriticalError(
      'No question templates found. Check that template files exist in the templates directory.',
      CURRENT_MODULE_NAME
    );
  }

  // Outer loop to allow returning to template selection after preview
  while (true) {
    logger.log('\n' + colorize('Select preset (you can customize it later):', 'bright'));
    logger.log(colorize('─'.repeat(50), 'dim'));

    templates.forEach((template, index) => {
      logger.log(`${colorize(`[${index + 1}]`, 'cyan')} ${colorize(`${template.display_name} (${template.questions.length} questions)`, 'bright')}`);
      logger.log(`${colorize(template.description, 'dim')}`);
      //if (index < templates.length - 1) logger.log(''); // Add space between templates
    });

    logger.log(colorize('[999] Custom set of questions', 'cyan'));
    logger.log(colorize('Enter 999 to create your own set of questions manually', 'dim'));

    // Get user selection with option to go back
    const selection = await question('\nSelect preset of questions (1-' + templates.length + ', or 0 to cancel): ');

    if (selection.trim() === '0') {
      throw new UserCancelledError();
    }

    // Handle 999 - empty template for custom questions
    if (selection.trim() === '999') {
      logger.log(colorize('\n✓ Custom Questions template selected', 'green'));
      return {
        name: 'custom',
        display_name: 'Custom Questions',
        description: 'Create your own custom questions',
        questions: []
      };
    }

    const num = parseInt(selection);

    // Validate selection
    if (isNaN(num) || num < 1 || num > templates.length) {
      logger.error('Invalid selection. Please try again.');
      continue;
    }

    // Show preview of selected template
    const selectedTemplate = templates[num - 1];

    logger.log('\n' + colorize('─'.repeat(50), 'dim'));
    logger.log(colorize(`📋 Preview questions to AI:`, 'bright'));

    selectedTemplate.questions.forEach((q, i) => {
      const replacedText = q.replace(/{{SUBJECT}}/g, colorize(subject, 'cyan'));
      logger.log(`  ${colorize(`${i + 1}.`, 'cyan')} ${replacedText}`);
    });

    logger.log('\n' + colorize('─'.repeat(50), 'dim'));

    // Ask for confirmation (N is default)
    const confirm = await confirmAction('\nUse this set? You can edit them later', false);

    if (confirm) {
      return selectedTemplate;
    }

    // If 'n', Enter, or anything else, loop back to selection
    logger.log(colorize('\nReturning to template selection...', 'dim'));
  }
}

async function generateQuestionsFromTemplate(template: QuestionTemplate, subject: string): Promise<string[]> {
  // Handle empty template (custom questions)
  if (template.questions.length === 0) {
    logger.log('\n' + colorize('📝 Let\'s create your questions!', 'bright'));
    logger.log(colorize('Recommended: 3-5 questions minimum for best insights', 'dim'));
    logger.log(colorize('Type \'done\' when finished, or \'back\' to return to template selection', 'dim'));

    const questions: string[] = [];
    let questionNumber = 1;

    while (true) {
      const q = await question(`\nQuestion ${questionNumber}: `);

      if (q.toLowerCase() === 'done') {
        if (questions.length === 0) {
          logger.error('Please add at least one question before finishing.');
          continue;
        }
        const confirmDone = await confirmAction('Finish creating questions?', true);
        if (confirmDone) {
          break;
        }
      } else if (q.toLowerCase() === 'back') {
        throw new UserCancelledError();
      } else if (q.trim()) {
        questions.push(q.trim());
        questionNumber++;
      }
    }

    return questions;
  }

  // Normal template - replace {{SUBJECT}} placeholder
  return template.questions.map(q => q.replace(/{{SUBJECT}}/g, subject));
}

async function editQuestions(questions: string[]): Promise<string[]> {
  logger.log('\n' + colorize('📝 Review and edit the generated questions:', 'bright'));
  logger.log(colorize('(Press Enter to keep a question, or type a new one to replace it)', 'dim'));
  logger.log(colorize('(Type "add" to add more questions, "done" to finish, "back" to return to template selection)', 'dim'));

  const editedQuestions: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    logger.log(`\n${colorize(`[${i + 1}]`, 'cyan')} ${questions[i]}`);
    const input = await question('Edit (Press Enter to keep as is): ');

    if (input.toLowerCase() === 'done') {
      // Ask for confirmation before finishing
      const confirmDone = await confirmAction('Finish editing questions?', true);
      if (confirmDone) {
        // Keep remaining questions as-is
        editedQuestions.push(...questions.slice(i));
        break;
      } else {
        // Don't finish, continue editing current question
        i--; // Stay at current index
      }
    } else if (input.toLowerCase() === 'back') {
      // Go back to template selection
      throw new UserCancelledError();
    } else if (input.toLowerCase() === 'add') {
      // Add a new question
      const newQuestion = await question('New question: ');
      if (newQuestion) {
        editedQuestions.push(newQuestion);
      }
      i--; // Stay at current index
    } else if (input) {
      // Replace with new question
      editedQuestions.push(input);
    } else {
      // Keep original question
      editedQuestions.push(questions[i]);
    }
  }
  
  // Allow adding more questions
  while (true) {
    const addMore = await confirmAction('\nAdd another question?', false);
    if (!addMore) break;

    const newQuestion = await question('New question: ');
    if (newQuestion) {
      editedQuestions.push(newQuestion);
    }
  }

  return editedQuestions;
}

async function selectProjectAIPreset(projectName: string): Promise<{ ai_preset?: string, models?: string[] }> {
  while (true) {
    logger.log(colorize('Select a preset with AI models for your project:', 'yellow'));

    const ai_presets = loadAllAIPresets();
    const ai_presetList = Array.from(ai_presets.entries());

    // Display available ai_presets
    ai_presetList.forEach(([key, ai_preset], index) => {
      const modelCount = ai_preset.models?.[ModelType.GET_ANSWER].length || 0;
      //const modelsNames = ai_preset.models?.[ModelType.GET_ANSWER].join(', ');
      logger.log(`${index + 1}) ${colorize(ai_preset.name, 'cyan')} (${modelCount} AIs)- ${ai_preset.description}`);
    });

    const choice = await question('\nSelect option (1-' + (ai_presetList.length) + ', or Enter to go back): ');  

    if (choice.trim() === '0') {
      throw new UserCancelledError();
    }

    const choiceNum = parseInt(choice);

    if (choiceNum >= 1 && choiceNum <= ai_presetList.length) {
      // Use selected ai_preset
      const [ai_presetKey, ai_preset] = ai_presetList[choiceNum - 1];

      logger.log('\n' + colorize(`Selected AI models preset "${ai_preset.name}" with:`, 'green'));
      logger.log(`  - ${ai_preset.models[ModelType.GET_ANSWER].length} models for fetching answers`);

      return { ai_preset: ai_presetKey };
      // If not confirmed, loop back to selection
      logger.log(colorize('\nReturning to preset selection...', 'dim'));
    } else {
      // Invalid input - show error and try again
      logger.error(`Invalid selection. Please enter a number between 1 and ${ai_presetList.length} or zero 0 to cancel. `);
    }
  }
}

function parseNumberRange(input: string, max: number): number[] {
  const indices: Set<number> = new Set();
  const parts = input.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes('-')) {
      // Range like "5-8"
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end && i <= max; i++) {
          if (i >= 1) indices.add(i - 1); // Convert to 0-based
        }
      }
    } else {
      // Single number
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 1 && num <= max) {
        indices.add(num - 1); // Convert to 0-based
      }
    }
  }
  
  return Array.from(indices).sort((a, b) => a - b);
}

async function saveProject(config: ProjectSetupConfig): Promise<void> {
  const projectDir = PROJECT_DIR(config.projectName);
  await fs.mkdir(projectDir, { recursive: true });
  
  // Save questions
  const questionsContent = `# Questions for ${config.display_name}
# ${config.description}
# Generated by AI Search Watch

${config.questions.join('\n')}
`;
  
  const questionsPath = getUserProjectQuestionsFile(config.projectName);
  await writeFileAtomic(questionsPath, questionsContent);
  
  // Save project configuration with ai_preset or models
  const projectConfig: any = {
    name: config.projectName,
    display_name: config.display_name,
    description: config.description,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Add ai_preset if provided, otherwise use models
  if (config.ai_preset) {
    projectConfig.ai_preset = config.ai_preset;
  } else {
    // Default to DEFAULT_PRESET_NAME ai_preset
    projectConfig.ai_preset = DEFAULT_PRESET_NAME;
  }
  
  const configPath = getUserProjectConfigFile(config.projectName);
  await writeFileAtomic(configPath, JSON.stringify(projectConfig, null, 2));
}

async function generateUniqueProjectName(baseName: string): Promise<string> {
  const sanitized = sanitizeProjectName(baseName);
  let projectName = sanitized;
  let counter = 1;

  while (true) {
    const projectDir = PROJECT_DIR(projectName);
    try {
      await fs.access(projectDir);
      // Directory exists, try with a number
      projectName = `${sanitized}_${counter}`;
      counter++;
    } catch {
      // Directory doesn't exist, we can use this name
      return projectName;
    }
  }
}

// ============================================================================
// Step Functions for State Machine Navigation
// ============================================================================

interface StepData {
  subject?: string;
  template?: QuestionTemplate;
  projectName?: string;
  display_name?: string;
  description?: string;
  questions?: string[];
  ai_preset?: string;
}

/**
 * Step 1: Get topic/subject from user
 * Allows cancellation with double-Enter which asks for exit confirmation
 */
async function getTopicStep(): Promise<string> {
  logger.log('\n' + colorize('Step 1: Enter The Topic/Subject for tracking', 'bright'));
  logger.log(colorize('Enter topic/subject would you like to track mentions about?', 'dim'));
  logger.log(colorize('Examples: "Storage APIs", "Project Management Apps", "Electric Vehicles", etc.', 'dim'));

  try {
    const subject = await questionWithCancelOption('\nEnter the topic/subject: ', 'Press Enter again to exit, or type your topic: ');
    return subject;
  } catch (error) {
    if (error instanceof UserCancelledError) {
      // Ask if they really want to exit
      const confirmExit = await confirmAction('Exit project creation?', false);
      if (confirmExit) {
        logger.log(colorize('\n✓ Project creation cancelled', 'dim'));
        process.exit(0);
      }
      // Try again
      return getTopicStep();
    }
    throw error;
  }
}

/**
 * Step 2: Select template for questions
 * Throws UserCancelledError to go back to Step 1
 */
async function getTemplateStep(subject: string): Promise<QuestionTemplate> {
  logger.log('\n' + colorize('Step 2: Select preset of questions', 'bright'));
  return await selectQuestionTemplate(subject);
}

/**
 * Step 3: Generate and edit questions
 * Throws UserCancelledError to go back to Step 2
 */
async function getQuestionsStep(template: QuestionTemplate, subject: string): Promise<string[]> {
  logger.log('\n' + colorize('Step 3: Review Questions', 'bright'));

  // Generate questions from template
  const generatedQuestions = await generateQuestionsFromTemplate(template, subject);

  // Edit questions
  const finalQuestions = await editQuestions(generatedQuestions);

  if (finalQuestions.length === 0) {
    logger.error('\n✗ At least one question is required');
    throw new UserCancelledError(); // Go back to template selection
  }

  return finalQuestions;
}

/**
 * Step 4: Select AI preset/models
 * Throws UserCancelledError to go back to Step 3
 */
async function getAIPresetStep(projectName: string): Promise<string> {
  logger.log('\n' + colorize('Step 4: Select Set of AI Models', 'bright'));
  const result = await selectProjectAIPreset(projectName);
  return result.ai_preset || DEFAULT_PRESET_NAME;
}

async function main() {
  logger.log(colorize('\n🚀 AI Search Watch - New Project Setup', 'bright'));
  logger.log(colorize('━'.repeat(50), 'dim'));

  // State machine data
  const data: StepData = {};
  let currentStep = 1;

  // State machine loop - navigate through steps with backward navigation support
  while (true) {
    try {
      if (currentStep === 1) {
        // Step 1: Get topic
        data.subject = await getTopicStep();
        currentStep = 2;
      } else if (currentStep === 2) {
        // Step 2: Select template
        data.template = await getTemplateStep(data.subject!);

        // Auto-generate project metadata
        data.display_name = data.subject!;
        data.projectName = await generateUniqueProjectName(data.subject!);
        data.description = `Monitoring ${data.subject} - ${data.template.description}`;        

        currentStep = 3;
      } else if (currentStep === 3) {
        // Step 3: Generate and edit questions
        data.questions = await getQuestionsStep(data.template!, data.subject!);
        currentStep = 4;
      } else if (currentStep === 4) {
        // Step 4: Select AI preset
        data.ai_preset = await getAIPresetStep(data.projectName!);

        // All steps completed, break out of loop
        break;
      }
    } catch (error) {
      if (error instanceof UserCancelledError) {
        // Go back to previous step
        currentStep = Math.max(1, currentStep - 1);
        logger.log(colorize(`\nGoing back to Step ${currentStep}...`, 'dim'));
      } else {
        // Other error - rethrow
        throw error;
      }
    }
  }

  // Save project
  try {
    await saveProject({
      projectName: data.projectName!,
      display_name: data.display_name!,
      description: data.description!,
      questions: data.questions!,
      ai_preset: data.ai_preset!
    });

    logger.success(`\n✓ Project "${data.display_name}" created successfully! Saved to "${getProjectDisplayPath(data.projectName!)}"`);

    // Output marker for pipeline to capture
    console.log(`AICW_OUTPUT_STRING:${data.projectName}`);

    await waitForEnterInInteractiveMode();

    return data.projectName;

  } catch (error) {
    logger.error('\n✗ Failed to save project');
    console.error(error);
    throw new Error('Failed to save project');
  }
}

main().catch(err => {
  logger.error('Failed to save project:');
  console.error(err);
  throw err;
});
