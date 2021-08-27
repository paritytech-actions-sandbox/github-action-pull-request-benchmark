import * as core from '@actions/core';
import { configFromJobInput } from './config';
import { extractResult } from './extract';
import { writeBenchmark, compareBenchmark } from './write';
import {  getLatestPRCommit, getBaseCommit } from './git';

async function main() {
    const config = await configFromJobInput();
    core.debug(`Config extracted from job: ${config}`);

    const bench = await extractResult(config.outputFilePath, config.tool, getLatestPRCommit());
    core.debug(`Benchmark result was extracted: ${bench}`);
    if (config.baseFilePath) {
        const baseBench = await extractResult(config.baseFilePath, config.tool, getBaseCommit());
        console.log('Comparing PR benchmark to base branch...');
        await compareBenchmark(bench, baseBench, config);
    } else {
        await writeBenchmark(bench, config);
    }

    console.log('github-action-benchmark was run successfully!', '\nData:', bench);
}

main().catch(e => core.setFailed(e.message));
