import { promises as fs } from 'fs';
import path, { join } from 'path';
import { createInterface } from 'readline';
import { colorize,  waitForEnterInInteractiveMode,  writeFileAtomic } from '../utils/misc-utils.js';
import { ModelConfig, loadAllAIPresets, getAIAIPresetWithModels } from '../utils/model-config.js';
import { ROOT_DIR, PROJECT_DIR } from '../config/paths.js';
import { getProjectDisplayPath, getPackageRoot, getUserProjectQuestionsFile, getUserProjectConfigFile } from '../config/user-paths.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
import { USER_QUESTION_TEMPLATES_DIR } from '../config/user-paths.js';
import { CompactLogger } from '../utils/compact-logger.js';
const logger = CompactLogger.getInstance();

const CURRENT_MODULE_NAME = getModuleNameFromUrl(import.meta.url);

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

async function selectQuestionTemplate(): Promise<QuestionTemplate | null> {
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
      if (index < templates.length - 1) logger.log(''); // Add space between templates
    });

    // Get user selection with option to return to main menu
    const selection = await question('\nSelect template to preview (1-' + templates.length + ', 999 for custom, or Enter to return): ');

    // Handle Enter key - return to main menu
    if (selection.trim() === '') {
      return null;
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
    logger.log(colorize(`📋 Preview: ${selectedTemplate.display_name}`, 'bright'));
    logger.log(colorize(`${selectedTemplate.description}`, 'dim'));
    logger.log('\n' + colorize('Questions:', 'yellow'));

    selectedTemplate.questions.forEach((q, i) => {
      logger.log(`  ${colorize(`${i + 1}.`, 'cyan')} ${q}`);
    });

    logger.log('\n' + colorize('─'.repeat(50), 'dim'));

    // Ask for confirmation (N is default)
    const confirm = await question('\nDo you want to use this template? (y/N): ');

    if (confirm.toLowerCase() === 'y') {
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
    logger.log(colorize('Type \'done\' when finished', 'dim'));

    const questions: string[] = [];
    let questionNumber = 1;

    while (true) {
      const q = await question(`\nQuestion ${questionNumber}: `);

      if (q.toLowerCase() === 'done') {
        break;
      }

      if (q.trim()) {
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
  logger.log(colorize('(Type "add" to add more questions, "done" to finish)', 'dim'));
  
  const editedQuestions: string[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    logger.log(`\n${colorize(`[${i + 1}]`, 'cyan')} ${questions[i]}`);
    const input = await question('Edit (Press Enter to keep as is): ');
    
    if (input.toLowerCase() === 'done') {
      // Keep remaining questions as-is
      editedQuestions.push(...questions.slice(i));
      break;
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
    const addMore = await question('\nAdd another question? (y/n): ');
    if (addMore.toLowerCase() !== 'y') break;
    
    const newQuestion = await question('New question: ');
    if (newQuestion) {
      editedQuestions.push(newQuestion);
    }
  }
  
  return editedQuestions;
}

async function selectProjectAIPreset(projectName: string): Promise<{ ai_preset?: string, models?: string[] }> {
  logger.log(colorize('Select a preset with AI models for your project:', 'yellow'));
  logger.log('\n' + colorize('Available presets with AI models presets:', 'bright'));
  
  const ai_presets = loadAllAIPresets();
  const ai_presetList = Array.from(ai_presets.entries());

  // Display available ai_presets
  ai_presetList.forEach(([key, ai_preset], index) => {
    const modelCount = ai_preset.models?.[ModelType.GET_ANSWER].length || 0;
    //const modelsNames = ai_preset.models?.[ModelType.GET_ANSWER].join(', ');
    logger.log(`${index + 1}) ${colorize(ai_preset.name, 'cyan')} (${modelCount} AIs)- ${ai_preset.description}`);
  });

  const choice = await question('\nSelect option (1-' + (ai_presetList.length) + '): ');
  const choiceNum = parseInt(choice);

  if (choiceNum >= 1 && choiceNum <= ai_presetList.length) {
    // Use selected ai_preset
    const [ai_presetKey, ai_preset] = ai_presetList[choiceNum - 1];

    logger.log('\n' + colorize(`Selected AI models preset "${ai_preset.name}" with:`, 'green'));
    logger.log(`  - ${ai_preset.models[ModelType.GET_ANSWER].length} models for fetching answers`);

    const confirm = await question('\nUse this AI models preset? (Y/n): ');
    if (confirm.toLowerCase() === 'n') {
      return selectProjectAIPreset(projectName); // Recursive call to try again
    }

    return { ai_preset: ai_presetKey };
  } else {
    // Use DEFAULT_PRESET_NAME ai_preset as default
    return { ai_preset: DEFAULT_PRESET_NAME };
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

async function main() {
  logger.log(colorize('\n🚀 AI Search Watch - New Project Setup', 'bright'));
  logger.log(colorize('━'.repeat(50), 'dim'));
  
  // Step 1: Select template first
  logger.log('\n' + colorize('Step 1: Choose Set for Questions', 'bright'));
  const template = await selectQuestionTemplate();
  if (!template) {
    logger.log(colorize('\n✓ Project creation cancelled', 'dim'));
    process.exit(0);
  }
  
  // Step 2: Get subject for template
  logger.log('\n' + colorize('Step 2: Enter The Topic/Subject', 'bright'));
  logger.log(colorize(`Questions Preset: ${template.display_name}`, 'green'));
  logger.log(colorize('What topic would you like to monitor?', 'dim'));
  logger.log(colorize('Examples: "Storage APIs", "AI Writing Tools", "Project Management Software", "Electric Vehicles"', 'dim'));
  const subject = await question('\nTopic: ');
  
  if (!subject) {
    logger.error('\n✗ Topic is required');
    process.exit(1);
  }
  
  // Auto-generate project name from subject
  const display_name = subject;
  const projectName = await generateUniqueProjectName(subject);
  
  // Auto-generate description based on template and subject
  const description = `Monitoring ${subject} - ${template.description}`;
  
  // Show auto-generated project info
  logger.log('\n' + colorize('Project Details:', 'bright'));
  logger.log(colorize('━'.repeat(50), 'dim'));
  logger.log(`  ${colorize('Name:', 'yellow')} ${display_name}`);
  logger.log(`  ${colorize('Folder:', 'yellow')} ${getProjectDisplayPath(projectName)}`);
  logger.log(`  ${colorize('Type:', 'yellow')} ${template.display_name}`);
  logger.log(colorize('━'.repeat(50), 'dim'));
  
  // Generate questions from template
  const generatedQuestions = await generateQuestionsFromTemplate(template, subject);
  
  // Step 3: Review and edit questions
  logger.log('\n' + colorize('Step 3: Review Questions', 'bright'));
  const finalQuestions = await editQuestions(generatedQuestions);
  
  if (finalQuestions.length === 0) {
    logger.error('\n✗ At least one question is required');
    process.exit(1);
  }
  
  // Step 4: Model selection
  logger.log('\n' + colorize('Step 4: Select Set of AI Models To Monitor', 'bright'));
  const ai_presetSelection = await selectProjectAIPreset(projectName);

  // Save project
  try {
    await saveProject({
      projectName,
      display_name,
      description,
      questions: finalQuestions,
      ai_preset: ai_presetSelection.ai_preset
    });
    
    logger.success(`\n✓ Project "${display_name}" created successfully! Saved to "${getProjectDisplayPath(projectName)}"`);
  
    // Output marker for pipeline to capture
    console.log(`AICW_OUTPUT_STRING:${projectName}`);

    await waitForEnterInInteractiveMode();

    return projectName;

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
