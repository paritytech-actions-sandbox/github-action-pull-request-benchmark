import * as github from '@actions/github';
import { Context } from '@actions/github/lib/context';

export { PayloadRepository } from '@actions/github/lib/interfaces';

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

export type GitHubContext = Context;

export function getLatestPRCommit(githubContext: GitHubContext): Commit {
    const pr = githubContext.payload.pull_request;
    if (!pr) {
        throw new Error(`No commit information is found in payload: ${JSON.stringify(githubContext.payload, null, 2)}`);
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

export function getBaseCommit(githubContext: GitHubContext): Commit {
    const pr = githubContext.payload.pull_request;
    if (!pr) {
        throw new Error(`No commit information is found in payload: ${JSON.stringify(githubContext.payload, null, 2)}`);
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

export function getGitHubContext(): GitHubContext {
    return github.context;
}

export function getCurrentRepo(gitHubContext: GitHubContext) {
    const repo = gitHubContext.payload.repository;
    if (!repo) {
        throw new Error(
            `Repository information is not available in payload: ${JSON.stringify(gitHubContext.payload, null, 2)}`,
        );
    }
    return repo;
}

export async function publishComment(commitId: string, body: string, token: string, gitHubContext: GitHubContext) {
    const repo = getCurrentRepo(gitHubContext);
    // eslint-disable-next-line @typescript-eslint/camelcase
    const repoUrl = repo.html_url ?? '';
    const client = new github.GitHub(token);
    const res = await client.repos.createCommitComment({
        owner: repo.owner.login,
        repo: repo.name,
        // eslint-disable-next-line @typescript-eslint/camelcase
        commit_sha: commitId,
        body,
    });

    const commitUrl = `${repoUrl}/commit/${commitId}`;
    console.log(`Comment was sent to ${commitUrl}. Response:`, res.status, res.data);

    return res;
}
