import * as core from '@actions/core';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

export type ToolType = 'cargo' | 'go' | 'benchmarkjs' | 'pytest' | 'googlecpp' | 'catch2';
export interface Config {
    name: string;
    tool: ToolType;
    prBenchmarkFilePath: string;
    baseBenchmarkFilePath: string;
    githubToken?: string;
    commentAlways: boolean;
    commentOnAlert: boolean;
    alertThreshold: number;
    failOnAlert: boolean;
    failThreshold: number;
    alertCommentCcUsers: string[];
}

export const VALID_TOOLS: Set<string> = new Set(['cargo', 'go', 'benchmarkjs', 'pytest', 'googlecpp', 'catch2']);

function validateToolType(tool: string): asserts tool is ToolType {
    if (VALID_TOOLS.has(tool)) {
        return;
    }
    throw new Error(`Invalid value '${tool}' for 'tool' input. It must be one of ${VALID_TOOLS}`);
}

function resolvePath(p: string): string {
    if (p.startsWith('~')) {
        const home = os.homedir();
        if (!home) {
            throw new Error(`Cannot resolve '~' in ${p}`);
        }
        p = path.join(home, p.slice(1));
    }
    return path.resolve(p);
}

async function resolveFilePath(p: string): Promise<string> {
    p = resolvePath(p);

    let s;
    try {
        s = await fs.stat(p);
    } catch (e) {
        throw new Error(`Cannot stat '${p}': ${e}`);
    }

    if (!s.isFile()) {
        throw new Error(`Specified path '${p}' is not a file`);
    }

    return p;
}

async function validateOutputFilePath(filePath: string): Promise<string> {
    try {
        return await resolveFilePath(filePath);
    } catch (err) {
        throw new Error(`Invalid value for 'output-file-path' input: ${err}`);
    }
}

function validateName(name: string) {
    if (name) {
        return;
    }
    throw new Error('Name must not be empty');
}

function validateGitHubToken(inputName: string, githubToken: string | undefined, todo: string) {
    if (!githubToken) {
        throw new Error(`'${inputName}' is enabled but 'github-token' is not set. Please give API token ${todo}`);
    }
}

function getBoolInput(name: string): boolean {
    const input = core.getInput(name);
    if (!input) {
        return false;
    }
    if (input !== 'true' && input !== 'false') {
        throw new Error(`'${name}' input must be boolean value 'true' or 'false' but got '${input}'`);
    }
    return input === 'true';
}

function getPercentageInput(name: string): number | null {
    const input = core.getInput(name);
    if (!input) {
        return null;
    }
    if (!input.endsWith('%')) {
        throw new Error(`'${name}' input must ends with '%' for percentage value (e.g. '200%')`);
    }

    const percentage = parseFloat(input.slice(0, -1)); // Omit '%' at last
    if (isNaN(percentage)) {
        throw new Error(`Specified value '${input.slice(0, -1)}' in '${name}' input cannot be parsed as float number`);
    }

    return percentage / 100;
}

function getCommaSeparatedInput(name: string): string[] {
    const input = core.getInput(name);
    if (!input) {
        return [];
    }
    return input.split(',').map(s => s.trim());
}

function validateAlertCommentCcUsers(users: string[]) {
    for (const u of users) {
        if (!u.startsWith('@')) {
            throw new Error(`User name in 'alert-comment-cc-users' input must start with '@' but got '${u}'`);
        }
    }
}

function validateAlertThreshold(alertThreshold: number | null, failThreshold: number | null): asserts alertThreshold {
    if (alertThreshold === null) {
        throw new Error("'alert-threshold' input must not be empty");
    }
    if (failThreshold === null) {
        throw new Error("'fail-threshold' input must not be empty");
    }
    if (failThreshold && alertThreshold > failThreshold) {
        throw new Error(
            `'alert-threshold' value must be smaller than 'fail-threshold' value but got ${alertThreshold} > ${failThreshold}`,
        );
    }
}

export async function configFromJobInput(): Promise<Config> {
    const tool: string = core.getInput('tool');
    const name: string = core.getInput('name');
    const prBenchmarkFilePath: string = await validateOutputFilePath(core.getInput('pr-benchmark-file-path'));
    const baseBenchmarkFilePath: string = await validateOutputFilePath(core.getInput('base-benchmark-file-path'));
    const githubToken: string | undefined = core.getInput('github-token') || undefined;
    const commentAlways = getBoolInput('comment-always');
    const commentOnAlert = getBoolInput('comment-on-alert');
    const alertThreshold = getPercentageInput('alert-threshold');
    const failThreshold = getPercentageInput('fail-threshold') || alertThreshold;
    const failOnAlert = getBoolInput('fail-on-alert');
    const alertCommentCcUsers = getCommaSeparatedInput('alert-comment-cc-users');

    validateToolType(tool);
    validateName(name);
    commentAlways && validateGitHubToken('comment-always', githubToken, 'to send commit comment');
    commentOnAlert && validateGitHubToken('comment-on-alert', githubToken, 'to send commit comment');
    validateAlertThreshold(alertThreshold, failThreshold);
    validateAlertCommentCcUsers(alertCommentCcUsers);

    return {
        name,
        tool,
        prBenchmarkFilePath,
        baseBenchmarkFilePath,
        githubToken,
        commentAlways,
        commentOnAlert,
        alertThreshold,
        failThreshold: failThreshold!,
        failOnAlert,
        alertCommentCcUsers,
    };
}
