/**
 * Demo Reports command - shows demo reports URL
 */

import { colorize } from './utils/misc-utils.js';

async function main() {
  console.log(colorize('\n🌐 AI Chat Watch - Demo Reports', 'bright'));
  console.log(colorize('━'.repeat(50), 'dim'));

  const demoReportsUrl = 'https://aichatwatch.com/demo/reports/index.html';

  console.log('\n📊 Explore live demo reports to see AI Chat Watch in action:');
  console.log(colorize(`\n   ${demoReportsUrl}`, 'cyan'));
  console.log('\n' + colorize('These reports show how different AI models respond to various questions.', 'dim'));
}

main().catch(err => {
  console.error(err.message || err.toString());
  throw err;
});
