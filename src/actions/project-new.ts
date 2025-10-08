import { promises as fs } from 'fs';
import path, { join } from 'path';
import { createInterface } from 'readline';
import { colorize,  waitForEnterInInteractiveMode,  writeFileAtomic } from '../utils/misc-utils.js';
import { ModelConfig, loadAllAIPresets, getAIAIPresetWithModels } from '../utils/model-config.js';
import { ROOT_DIR, QUESTION_TEMPLATES_DIR, PROJECT_DIR } from '../config/paths.js';
import { getProjectDisplayPath, getPackageRoot, getUserProjectQuestionsFile, getUserProjectConfigFile } from '../config/user-paths.js';
// get action name for the current module
import { getModuleNameFromUrl } from '../utils/misc-utils.js';
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
import { validateProjectName, sanitizeProjectName } from '../utils/project-utils.js';
import { DEFAULT_PRESET_NAME } from '../ai-preset-manager.js';

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

async function multilineInput(prompt: string): Promise<string> {
  logger.info(prompt);
  logger.info(colorize('(Press Enter twice to finish)', 'dim'));
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const lines: string[] = [];
  let emptyLineCount = 0;
  
  return new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          rl.close();
          resolve(lines.join('\n').trim());
        } else {
          lines.push(line);
        }
      } else {
        emptyLineCount = 0;
        lines.push(line);
      }
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
    const files = await fs.readdir(QUESTION_TEMPLATES_DIR);
    const templateFiles = files.filter(f => f.endsWith('.md') && !f.includes('.description.'));
    
    for (const file of templateFiles) {
      const name = file.replace('.md', '');
      const display_name = name.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      // Load template questions
      const questionsPath = join(QUESTION_TEMPLATES_DIR, file);
      const questionsContent = await fs.readFile(questionsPath, 'utf-8');
      const questions = questionsContent.split('\n').filter(line => line.trim());
      
      // Load description if exists
      let description = '';
      try {
        const descPath = join(QUESTION_TEMPLATES_DIR, `${name}.description.md`);
        description = await fs.readFile(descPath, 'utf-8').then(d => d.trim());
      } catch {
        description = `Questions about ${display_name}`;
      }
      
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
    logger.error('No question templates found');
    return null;
  }
  
  logger.info('\n' + colorize('Select a ai_preset with a set of questions:', 'bright'));
  logger.info(colorize('─'.repeat(50), 'dim'));
  
  templates.forEach((template, index) => {
    logger.info(`${colorize(`[${index + 1}]`, 'cyan')} ${colorize(`${template.display_name} (${template.questions.length} questions)`, 'bright')}`);
    logger.info(`${colorize(template.description, 'dim')}`);
    if (index < templates.length - 1) logger.info(''); // Add space between templates
  });
  
  let selection: string;
  do {
    selection = await question('\nSelect template (1-' + templates.length + '): ');
    const num = parseInt(selection);
    if (num >= 1 && num <= templates.length) {
      return templates[num - 1];
    }
    logger.error('Invalid selection. Please try again.');
  } while (true);
}

async function generateQuestionsFromTemplate(template: QuestionTemplate, subject: string): Promise<string[]> {
  return template.questions.map(q => q.replace(/{{SUBJECT}}/g, subject));
}

async function editQuestions(questions: string[]): Promise<string[]> {
  logger.info('\n' + colorize('📝 Review and edit the generated questions:', 'bright'));
  logger.info(colorize('(Press Enter to keep a question, or type a new one to replace it)', 'dim'));
  logger.info(colorize('(Type "add" to add more questions, "done" to finish)', 'dim'));
  
  const editedQuestions: string[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    logger.info(`\n${colorize(`[${i + 1}]`, 'cyan')} ${questions[i]}`);
    const input = await question('Edit: ');
    
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
  logger.info(colorize('Select a model ai_preset for your project:', 'yellow'));
  logger.info('\n' + colorize('Available AIPresets:', 'bright'));
  
  const ai_presets = loadAllAIPresets();
  const ai_presetList = Array.from(ai_presets.entries());

  // Display available ai_presets
  ai_presetList.forEach(([key, ai_preset], index) => {
    const modelCount = ai_preset.models?.['answer'].length || 0;
    logger.info(`${index + 1}) ${colorize(ai_preset.name, 'cyan')} - ${ai_preset.description} (${modelCount} models: ${ai_preset.models?.['answer'].join(', ')})`);
  });

  const choice = await question('\nSelect option (1-' + (ai_presetList.length + 2) + '): ');
  const choiceNum = parseInt(choice);

  if (choiceNum >= 1 && choiceNum <= ai_presetList.length) {
    // Use selected ai_preset
    const [ai_presetKey, ai_preset] = ai_presetList[choiceNum - 1];

    logger.info('\n' + colorize(`Selected ai_preset "${ai_preset.name}" with:`, 'green'));
    logger.info(`  - ${ai_preset.models['answer'].length} models for fetching answers`);

    const confirm = await question('\nUse this ai_preset? (Y/n): ');
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
  logger.info(colorize('\n🚀 AI Search Watch - Smart Project Setup', 'bright'));
  logger.info(colorize('━'.repeat(50), 'dim'));
  
  // Step 1: Select template first
  logger.info('\n' + colorize('Step 1: Choose AIPreset with Questions', 'bright'));
  const template = await selectQuestionTemplate();
  if (!template) {
    logger.error('\n✗ Question template selection failed');
    process.exit(1);
  }
  
  // Step 2: Get subject for template
  logger.info('\n' + colorize('Step 2: Enter The Topic To Monitor', 'bright'));
  logger.info(colorize(`AIPreset: ${template.display_name}`, 'green'));
  logger.info(colorize('What topic would you like to monitor?', 'dim'));
  logger.info(colorize('Examples: "Storage APIs", "AI Writing Tools", "Project Management Software", "Electric Vehicles"', 'dim'));
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
  logger.info('\n' + colorize('Project Details:', 'bright'));
  logger.info(colorize('━'.repeat(50), 'dim'));
  logger.info(`  ${colorize('Name:', 'yellow')} ${display_name}`);
  logger.info(`  ${colorize('Folder:', 'yellow')} ${getProjectDisplayPath(projectName)}`);
  logger.info(`  ${colorize('Type:', 'yellow')} ${template.display_name}`);
  logger.info(colorize('━'.repeat(50), 'dim'));
  
  // Generate questions from template
  const generatedQuestions = await generateQuestionsFromTemplate(template, subject);
  
  // Step 3: Review and edit questions
  logger.info('\n' + colorize('Step 3: Review Questions', 'bright'));
  const finalQuestions = await editQuestions(generatedQuestions);
  
  if (finalQuestions.length === 0) {
    logger.error('\n✗ At least one question is required');
    process.exit(1);
  }
  
  // Step 4: Model selection
  logger.info('\n' + colorize('Step 4: Select Set of AI Models To Monitor', 'bright'));
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
    
    logger.success(`\n✓ Project "${display_name}" created successfully!`);
  
    await waitForEnterInInteractiveMode();

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
