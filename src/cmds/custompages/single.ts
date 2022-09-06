import type { CommandOptions } from '../../lib/baseCommand';

import chalk from 'chalk';
import config from 'config';

import Command, { CommandCategories } from '../../lib/baseCommand';
import supportsGHA from '../../lib/decorators/supportsGHA';
import pushDoc from '../../lib/pushDoc';

export type Options = {
  dryRun?: boolean;
  filePath?: string;
};

@supportsGHA
export default class SingleCustomPageCommand extends Command {
  constructor() {
    super();
    this.command = 'custompages:single';
    this.usage = 'custompages:single <file> [options]';
    this.description = 'Sync a single Markdown file to your ReadMe project as a Custom Page.';
    this.cmdCategory = CommandCategories.CUSTOM_PAGES;
    this.position = 2;

    this.hiddenArgs = ['filePath'];
    this.args = [
      this.getKeyArg(),
      {
        name: 'filePath',
        type: String,
        defaultOption: true,
      },
      this.getGitHubArg(),
      {
        name: 'dryRun',
        type: Boolean,
        description: 'Runs the command without creating/updating any custom pages in ReadMe. Useful for debugging.',
      },
    ];
  }

  async run(opts: CommandOptions<Options>) {
    super.run(opts);

    const { dryRun, filePath, key } = opts;

    if (!filePath) {
      return Promise.reject(new Error(`No file path provided. Usage \`${config.get('cli')} ${this.usage}\`.`));
    }

    if (
      !(
        filePath.toLowerCase().endsWith('.html') ||
        filePath.toLowerCase().endsWith('.md') ||
        filePath.toLowerCase().endsWith('.markdown')
      )
    ) {
      return Promise.reject(new Error('The file path specified is not a Markdown or HTML file.'));
    }

    const createdDoc = await pushDoc(key, undefined, dryRun, filePath, this.cmdCategory);

    return Promise.resolve(chalk.green(createdDoc));
  }
}
