#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { run } from '../src/pipeline.js';
import { selfUpdate, checkForUpdate } from '../src/updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('apa')
  .description('ASMR Project Assembler — generates FCPXML multicam projects from a folder of video clips')
  .version(pkg.version);

// Default command: generate FCPXML
program
  .command('generate', { isDefault: true })
  .description('Generate an FCPXML multicam project from a folder of clips')
  .requiredOption('-i, --input <path>', 'path to folder containing video clips')
  .option('-c, --config <path>', 'path to apa.config.json', './apa.config.json')
  .action(async (opts) => {
    const inputPath = resolve(opts.input);
    const configPath = resolve(opts.config);

    if (!existsSync(inputPath)) {
      console.error(`Error: input folder not found: ${inputPath}`);
      process.exit(1);
    }

    let config = {};
    if (existsSync(configPath)) {
      const raw = await readFile(configPath, 'utf8');
      config = JSON.parse(raw);
    } else {
      console.warn(`Warning: config file not found at ${configPath}, using defaults`);
    }

    await run(inputPath, config);
  });

// Update command
program
  .command('update')
  .description('Check for a newer version and update the binary in-place')
  .option('--check', 'check for updates without installing')
  .action(async (opts) => {
    if (opts.check) {
      try {
        const { current, latest, hasUpdate } = await checkForUpdate(pkg.version);
        if (hasUpdate) {
          console.log(`Update available: ${current} → ${latest}`);
          console.log('Run: apa update');
        } else {
          console.log(`Up to date (${current}).`);
        }
      } catch (err) {
        console.error(`Update check failed: ${err.message}`);
        process.exit(1);
      }
      return;
    }

    await selfUpdate(pkg.version);
  });

program.parse(process.argv);
