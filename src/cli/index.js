#!/usr/bin/env node
import chalk from 'chalk';
import globby from 'globby';
import inquirer from 'inquirer';
import meow from 'meow';
import updateNotifier from 'update-notifier';

import checkGitStatus from './git-status';
import { executeTransformations } from './transformers';

const cli = meow(
    {
        description: 'Codemods for migrating test files to Jest.',
        help: `
    Usage
      $ jest-codemods <path> [options]

    path    Files or directory to transform. Can be a glob like src/**.test.js

    Options
      --force, -f   Bypass Git safety checks and forcibly run codemods
      --dry, -d     Dry run (no changes are made to files)
      --parser      The parser to use for parsing your source files (babel | babylon | flow)  [babel]
    `,
    },
    {
        boolean: ['force', 'dry'],
        string: ['_'],
        alias: {
            f: 'force',
            h: 'help',
            d: 'dry',
        },
    }
);

updateNotifier({ pkg: cli.pkg }).notify({ defer: false });

const TRANSFORMER_AVA = 'ava';
const TRANSFORMER_CHAI_ASSERT = 'chai-assert';
const TRANSFORMER_CHAI_SHOULD = 'chai-should';
const TRANSFORMER_EXPECT_JS = 'expect-js';
const TRANSFORMER_JASMINE_THIS = 'jasmine-this';
const TRANSFORMER_MOCHA = 'mocha';
const TRANSFORMER_SHOULD = 'should';
const TRANSFORMER_TAPE = 'tape';

const ALL_TRANSFORMERS = [
    TRANSFORMER_AVA,
    TRANSFORMER_CHAI_ASSERT,
    // TRANSFORMER_CHAI_SHOULD & TRANSFORMER_SHOULD doesn't have import detection
    // TODO: waiting for expect@20+ release: TRANSFORMER_EXPECT_1,
    TRANSFORMER_EXPECT_JS,
    TRANSFORMER_MOCHA,
    TRANSFORMER_TAPE,
    TRANSFORMER_JASMINE_THIS,
];

function supportFailure(supportedItems) {
    console.log(`\nCurrently, jest-codemods only has support for ${supportedItems}.`);
    console.log(
        'Feel free to create an issue on https://github.com/skovhus/jest-codemods to contribute!\n'
    );
}

inquirer
    .prompt([
        {
            type: 'list',
            name: 'transformer',
            message: 'Which test library would you like to migrate from?',
            choices: [
                {
                    name: 'AVA',
                    value: TRANSFORMER_AVA,
                },
                {
                    name: 'Chai: Assert Syntax',
                    value: TRANSFORMER_CHAI_ASSERT,
                },
                {
                    name: 'Chai: Should/Expect BDD Syntax',
                    value: TRANSFORMER_CHAI_SHOULD,
                },
                {
                    name: 'Expect.js (by Automattic)',
                    value: TRANSFORMER_EXPECT_JS,
                },
                /*
                // TODO: waiting for expect@20+ release
                {
                    name: 'Expect@1.x (by mjackson)',
                    value: TRANSFORMER_EXPECT_1,
                },
                */
                {
                    name: 'Jasmine: this usage',
                    value: TRANSFORMER_JASMINE_THIS,
                },
                {
                    name: 'Mocha',
                    value: TRANSFORMER_MOCHA,
                },
                {
                    name: 'Should.js',
                    value: TRANSFORMER_SHOULD,
                },
                {
                    name: 'Tape',
                    value: TRANSFORMER_TAPE,
                },
                {
                    name: 'All of the above (by detecting usage)!',
                    value: 'all',
                },
                {
                    name: 'Other',
                    value: 'other',
                },
            ],
        },
        /*
        // TODO: waiting for expect@20+ release
        {
            name: 'standaloneMode',
            type: 'list',
            message: 'Should the tests be able to run in a browser?',
            choices: [
                {
                    name: 'The tests should run on node.js (recommended)',
                    value: false,
                },
                {
                    name: 'The tests should run in a browser',
                    value: true,
                },
            ],
        },
        */
        {
            type: 'list',
            name: 'mochaAssertion',
            message: 'Would you like to include assertion transformations with Mocha?',
            when: ({ transformer }) => TRANSFORMER_MOCHA === transformer,
            choices: [
                {
                    name: 'Chai: Assert Syntax',
                    value: TRANSFORMER_CHAI_ASSERT,
                },
                {
                    name: 'Chai: Should/Expect BDD Syntax',
                    value: TRANSFORMER_CHAI_SHOULD,
                },
                {
                    name: 'Expect.js (by Automattic)',
                    value: TRANSFORMER_EXPECT_JS,
                },
                {
                    name: 'Should.js',
                    value: TRANSFORMER_SHOULD,
                },
                {
                    name: 'None',
                    value: null,
                },
            ],
        },
        {
            type: 'input',
            name: 'files',
            message: 'On which files or directory should the codemods be applied?',
            when: () => !cli.input.length,
            default: 'src test/**/*.js',
            filter: files => files.trim().split(/\s+/).filter(v => v),
        },
    ])
    .then(answers => {
        const { files, transformer, mochaAssertion, standaloneMode } = answers;

        if (transformer === 'other') {
            return supportFailure('AVA, Chai, Expect.js, Mocha, Should.js and Tape');
        }

        const transformers = transformer === 'all' ? ALL_TRANSFORMERS : [transformer];

        if (mochaAssertion) {
            transformers.push(mochaAssertion);
        }

        const filesExpanded = cli.input.length ? cli.input : globby.sync(files);
        if (!filesExpanded.length) {
            console.log(`No files found matching ${files.join(' ')}`);
            return;
        }

        if (!cli.flags.dry) {
            checkGitStatus(cli.flags.force);
        }

        const transformerArgs = [];
        if (standaloneMode) {
            transformerArgs.push('--standaloneMode=true');
            console.log(
                chalk.yellow(
                    '\nNOTICE: You need to manually install jest-matchers and jest-mock'
                )
            );
        }

        return executeTransformations(
            filesExpanded,
            cli.flags,
            transformers,
            transformerArgs
        );
    });
