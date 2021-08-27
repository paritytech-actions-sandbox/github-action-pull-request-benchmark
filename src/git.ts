import { exec } from '@actions/exec';
import * as core from '@actions/core';
import * as github from '@actions/github';

interface ExecResult {
    stdout: string;
    stderr: string;
    code: number | null;
}

export interface GitHubUser {
    email?: string;
    name: string;
    username: string;
}

export interface Commit {
    author: GitHubUser;
    committer: GitHubUser;
    distinct?: unknown; // Unused
    id: string;
    message: string;
    timestamp: string;
    tree_id?: unknown; // Unused
    url: string;
}

async function capture(cmd: string, args: string[]): Promise<ExecResult> {
    const res: ExecResult = {
        stdout: '',
        stderr: '',
        code: null,
    };

    try {
        const code = await exec(cmd, args, {
            listeners: {
                stdout(data) {
                    res.stdout += data.toString();
                },
                stderr(data) {
                    res.stderr += data.toString();
                },
            },
        });
        res.code = code;
        return res;
    } catch (err) {
        const msg = `Command '${cmd}' failed with args '${args.join(' ')}': ${res.stderr}: ${err}`;
        core.debug(`@actions/exec.exec() threw an error: ${msg}`);
        throw new Error(msg);
    }
}

export async function cmd(...args: string[]): Promise<string> {
    core.debug(`Executing Git: ${args.join(' ')}`);
    const userArgs = [
        '-c',
        'user.name=github-action-benchmark',
        '-c',
        'user.email=github@users.noreply.github.com',
        '-c',
        'http.https://github.com/.extraheader=', // This config is necessary to support actions/checkout@v2 (#9)
    ];
    const res = await capture('git', userArgs.concat(args));
    if (res.code !== 0) {
        throw new Error(`Command 'git ${args.join(' ')}' failed: ${JSON.stringify(res)}`);
    }
    return res.stdout;
}

function getRemoteUrl(token: string): string {
    /* eslint-disable @typescript-eslint/camelcase */
    const fullName = github.context.payload.repository?.full_name;
    /* eslint-enable @typescript-eslint/camelcase */

    if (!fullName) {
        throw new Error(`Repository info is not available in payload: ${JSON.stringify(github.context.payload)}`);
    }

    return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

export async function push(token: string, branch: string, ...options: string[]): Promise<string> {
    core.debug(`Executing 'git push' to branch '${branch}' with token and options '${options.join(' ')}'`);

    const remote = getRemoteUrl(token);
    let args = ['push', remote, `${branch}:${branch}`, '--no-verify'];
    if (options.length > 0) {
        args = args.concat(options);
    }

    return cmd(...args);
}

export async function pull(token: string | undefined, branch: string, ...options: string[]): Promise<string> {
    core.debug(`Executing 'git pull' to branch '${branch}' with token and options '${options.join(' ')}'`);

    const remote = token !== undefined ? getRemoteUrl(token) : 'origin';
    let args = ['pull', remote, branch];
    if (options.length > 0) {
        args = args.concat(options);
    }

    return cmd(...args);
}


export function getLatestPRCommit(): Commit {
    /* eslint-disable @typescript-eslint/camelcase */
    if (github.context.payload.head_commit) {
        return github.context.payload.head_commit;
    }

    const pr = github.context.payload.pull_request;
    if (!pr) {
        throw new Error(
            `No commit information is found in payload: ${JSON.stringify(github.context.payload, null, 2)}`,
        );
    }

    // On pull_request hook, head_commit is not available
    const message: string = pr.title;
    const id: string = pr.head.sha;
    const timestamp: string = pr.head.repo.updated_at;
    const url = `${pr.html_url}/commits/${id}`;
    const name: string = pr.head.user.login;
    const user = {
        name,
        username: name, // XXX: Fallback, not correct
    };

    return {
        author: user,
        committer: user,
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}

export function getBaseCommit(): Commit {
    const pr = github.context.payload.pull_request;
    if (!pr) {
        throw new Error(
            `No commit information is found in payload: ${JSON.stringify(github.context.payload, null, 2)}`,
        );
    }

    // On pull_request hook, head_commit is not available
    const message: string = pr.base.label;
    const id: string = pr.base.sha;
    const timestamp: string = pr.base.repo.updated_at;
    const url = `${pr.base.repo.html_url}/commits/${id}`;
    const name: string = pr.base.user.login;
    const user = {
        name,
        username: name, // XXX: Fallback, not correct
    };

    return {
        author: user,
        committer: user,
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}
