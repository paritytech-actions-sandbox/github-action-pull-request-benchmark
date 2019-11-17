import * as path from 'path';
import { promises as fs } from 'fs';
import * as cp from 'child_process';
import { DataJson, BenchmarkEntries, SCRIPT_PREFIX } from '../write';
import { VALID_TOOLS } from '../config';
import { Benchmark } from '../extract';
import { diff, Diff, DiffNew, DiffEdit, DiffArray } from 'deep-diff';
import deepEq = require('deep-equal');

function help(): never {
    throw new Error('Usage: node ci_validate_modification.js before_data.js');
}

async function exec(cmd: string): Promise<string> {
    console.log(`+ ${cmd}`);
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`Exec '${cmd}' failed with error ${err.message}. Stderr: '${stderr}'`));
                return;
            }
            resolve(stdout);
        });
    });
}

async function readDataJson(file: string): Promise<DataJson> {
    const content = await fs.readFile(file, 'utf8');
    return JSON.parse(content.slice(SCRIPT_PREFIX.length));
}

function validateDataJson(data: DataJson) {
    const { lastUpdate, repoUrl, entries } = data;
    const now = Date.now();
    if (lastUpdate > now) {
        throw new Error(`Last update is not correct: ${lastUpdate} v.s. ${now}`);
    }

    if (repoUrl !== 'https://github.com/rhysd/github-action-benchmark') {
        throw new Error(`repoUrl is not correct: ${repoUrl}`);
    }

    for (const benchName of Object.keys(entries)) {
        for (const entry of entries[benchName]) {
            const { commit, tool, date, benches } = entry;
            if (!(VALID_TOOLS as string[]).includes(tool)) {
                throw new Error(`Invalid tool ${tool}`);
            }
            if (!commit.url.startsWith('https://github.com/rhysd/github-action-benchmark/commit/')) {
                throw new Error(`Invalid commit url: ${commit.url}`);
            }
            if (!commit.url.endsWith(commit.id)) {
                throw new Error(`Commit ID ${commit.id} does not match to URL ${commit.url}`);
            }
            if (date > now) {
                throw new Error(`Benchmark date is not correct: ${date} v.s. ${now}`);
            }
            for (const bench of benches) {
                const { name, value, unit, range, extra } = bench;
                const json = JSON.stringify(bench);
                if (!name) {
                    throw new Error(`Benchmark result name is invalid: ${name} (${json})`);
                }
                if (typeof value !== 'number' || isNaN(value)) {
                    throw new Error(`Benchmark result value is invalid: ${value} (${json})`);
                }
                if (typeof unit !== 'string') {
                    throw new Error(`Benchmark result unit is invalid: ${unit} (${json})`);
                }
                if (range && typeof range !== 'string') {
                    throw new Error(`Benchmark result range is invalid: ${range} (${json})`);
                }
                if (extra && typeof extra !== 'string') {
                    throw new Error(`Benchmark result extra is invalid: ${extra} (${json})`);
                }
            }
        }
    }
}

function assertNumberDiffEdit(diff: Diff<unknown>): asserts diff is DiffEdit<number> {
    if (diff.kind !== 'E') {
        throw new Error(`Given diff is not DiffEdit: ${JSON.stringify(diff)}`);
    }
    if (typeof diff.lhs !== 'number') {
        throw new Error(`Given DiffEdit's lhs is not for number: ${diff.lhs}`);
    }
    if (typeof diff.rhs !== 'number') {
        throw new Error(`Given DiffEdit's rhs is not for number: ${diff.rhs}`);
    }
}

function validateLastUpdateMod<T, U>(diff: Diff<T, U>) {
    assertNumberDiffEdit(diff);
    if (!deepEq(diff.path, ['lastUpdate'])) {
        throw new Error(`Not diff for lastUpdate: ${JSON.stringify(diff.path)}`);
    }
    const { lhs, rhs } = diff;
    if (lhs >= rhs) {
        throw new Error(`Update of datetime is not correct. New is older: ${lhs} v.s. ${rhs}`);
    }
}

function assertDiffArray<T>(diff: Diff<T>): asserts diff is DiffArray<T> {
    if (diff.kind !== 'A') {
        throw new Error(`Given diff is not DiffArray: ${JSON.stringify(diff)}`);
    }
}

function assertDiffNewBench(diff: Diff<unknown>): asserts diff is DiffNew<Benchmark> {
    if (diff.kind !== 'N') {
        throw new Error(`Given diff is not DiffNew: ${JSON.stringify(diff)}`);
    }
    const { rhs } = diff;
    if (typeof rhs !== 'object' || rhs === null) {
        throw new Error(`DiffNew for Benchmark object is actually not a object: ${rhs}`);
    }
    for (const prop of ['commit', 'date', 'tool', 'benches']) {
        if (!(prop in rhs)) {
            throw new Error(`Not a valid benchmark object in DiffNew: ${JSON.stringify(rhs)}`);
        }
    }
}

function validateBenchmarkResultMod<T>(diff: Diff<T>, expectedBenchName: string, afterEntries: BenchmarkEntries) {
    if (!(expectedBenchName in afterEntries)) {
        throw new Error(`data.js after action does not contain '${expectedBenchName}' benchmark`);
    }

    const benchEntries = afterEntries[expectedBenchName];
    if (benchEntries.length === 0) {
        throw new Error('Benchmark entry is empty after action');
    }

    assertDiffArray(diff);

    if (!deepEq(diff.path, ['entries', expectedBenchName])) {
        throw new Error(`Diff path is not expected for adding new benchmark: ${JSON.stringify(diff.path)}`);
    }

    diff = diff.item;
    assertDiffNewBench(diff);

    const added: Benchmark = diff.rhs;
    const last = benchEntries[benchEntries.length - 1];
    if (last.commit.id !== added.commit.id) {
        throw new Error(
            `Newly added benchmark ${JSON.stringify(added)} is not the last one in data.js ${JSON.stringify(last)}`,
        );
    }

    for (const entry of benchEntries) {
        if (entry.date > added.date) {
            throw new Error(`Older entry's date ${JSON.stringify(entry)} is newer than added ${JSON.stringify(added)}`);
        }

        if (entry.tool !== added.tool) {
            throw new Error(`Tool is different between ${JSON.stringify(entry)} and ${JSON.stringify(added)}`);
        }

        for (const addedBench of added.benches) {
            for (const prevBench of entry.benches) {
                if (prevBench.name === addedBench.name) {
                    if (prevBench.unit !== addedBench.unit) {
                        throw new Error(
                            `Unit is different between previous benchmark and newly added benchmark: ${JSON.stringify(
                                prevBench,
                            )} v.v. ${JSON.stringify(addedBench)}`,
                        );
                    }
                }
            }
        }
    }
}

async function main() {
    console.log('Start validating modifications by action with args', process.argv);

    if (process.argv.length != 4) {
        help();
    }

    if (['-h', '--help'].includes(process.argv[2])) {
        help();
    }

    console.log('Checking pre-condition');
    const stats = await fs.stat(path.resolve('.git'));
    if (!stats.isDirectory()) {
        throw new Error('This script must be run at root directory of repository');
    }

    const beforeDataJs = path.resolve(process.argv[2]);
    const expectedBenchName = process.argv[3];

    console.log('Validating modifications by action');
    console.log(`  data.js before action: ${beforeDataJs}`);

    console.log('Reading data.js before action as JSON');
    const beforeJson = await readDataJson(beforeDataJs);

    console.log('Validating current branch');
    const stdout = await exec('git show -s --pretty=%d HEAD');
    if (stdout.includes('HEAD -> ')) {
        throw new Error(`Current branch is not detached head: '${stdout}'`);
    }

    console.log('Retrieving data.js after action');
    await exec('git checkout gh-pages');
    const afterJson = await readDataJson('dev/bench/data.js');
    await exec('git checkout -');

    console.log('Validating data.js both before/after action');
    validateDataJson(beforeJson);
    validateDataJson(afterJson);

    const diffs = diff(beforeJson, afterJson);
    console.log('Validating diffs:', diffs);

    if (!diffs || diffs.length !== 2) {
        throw new Error('Number of diffs are incorrect. Exact 2 diffs are expected');
    }

    console.log('Validating lastUpdate modification');
    validateLastUpdateMod(diffs[0]);

    console.log('Validating benchmark result modification');
    validateBenchmarkResultMod(diffs[1], expectedBenchName, afterJson.entries);

    console.log('👌');
}

main().catch(err => {
    console.error(err);
    process.exit(110);
});
