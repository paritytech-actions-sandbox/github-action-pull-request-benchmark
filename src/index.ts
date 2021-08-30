import * as core from '@actions/core';
import { configFromJobInput } from './config';
import { extractResult } from './extract';
import { compareBenchmarkAndAlert } from './alert';
import { getLatestPRCommit, getBaseCommit, getGitHubContext } from './git';

async function main() {
    const githubContext = getGitHubContext();
    const config = await configFromJobInput();
    core.debug(`Config extracted from job: ${config}`);

    const prBench = await extractResult(config.prBenchmarkFilePath, config.tool, getLatestPRCommit(githubContext));
    core.debug(`Benchmark result was extracted: ${prBench}`);
    const baseBench = await extractResult(config.baseBenchmarkFilePath, config.tool, getBaseCommit(githubContext));
    console.log('Comparing PR benchmark to base branch...');
    await compareBenchmarkAndAlert(prBench, baseBench, config, githubContext);

    console.log('github-action-benchmark was run successfully!', '\nData:', prBench);
}

main().catch(e => core.setFailed(e.message));
