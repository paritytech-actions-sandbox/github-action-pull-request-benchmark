import { deepStrictEqual as eq, ok as assertOk } from 'assert';
import * as path from 'path';
import { SinonSandbox, createSandbox, SinonStub, assert as sinonAssert } from 'sinon';
import { Config } from '../src/config';
import { Benchmark } from '../src/extract';
import { compareBenchmarkAndAlert } from '../src/alert';
import { GitHubContext, PayloadRepository } from '../src/git';
import * as git from '../src/git';
import * as core from '@actions/core';

const ok: (x: any, msg?: string) => asserts x = assertOk;

type OctokitOpts = { owner: string; repo: string; commit_sha: string; body: string };
class FakedOctokitRepos {
    spyOpts: OctokitOpts[];
    constructor() {
        this.spyOpts = [];
    }
    createCommitComment(opt: OctokitOpts) {
        this.spyOpts.push(opt);
        return Promise.resolve({
            status: 201,
            baseBenchmark: {
                html_url: 'https://dummy-comment-url',
            },
        });
    }
    lastCall(): OctokitOpts {
        return this.spyOpts[this.spyOpts.length - 1];
    }
    clear() {
        this.spyOpts = [];
    }
}

const fakedRepos = new FakedOctokitRepos();

// class MockedOctokit {
//     repos: FakedOctokitRepos;
//     opt: { token: string };
//     constructor(token: string) {
//         this.opt = { token };
//         this.repos = fakedRepos;
//     }
// }

const mockedGitHubContext = {
    payload: {
        repository: {
            owner: {
                login: 'user',
            },
            name: 'repo',
            full_name: 'user/repo',
            html_url: 'https://github.com/user/repo',
            private: false,
        } as PayloadRepository | undefined,
    },
    workflow: 'Workflow name',
};

// mock('@actions/github', { context: mockedGitHubContext, GitHub: MockedOctokit });
describe('comparexBenchmark()', function() {
    const rootDir = process.cwd();

    before(function() {
        process.chdir(path.join(rootDir, 'test', 'data', 'write'));
    });

    after(function() {
        // mock.stop('@actions/core');
        // mock.stop('@actions/github');
        process.chdir(rootDir);
    });

    afterEach(function() {
        fakedRepos.clear();
    });

    // Utilities for test data
    const lastUpdate = Date.now() - 10000;
    const user = {
        email: 'dummy@example.com',
        name: 'User',
        username: 'user',
    };

    function commit(id = 'commit id', message = 'dummy message', u = user) {
        return {
            author: u,
            committer: u,
            distinct: false,
            id,
            message,
            timestamp: 'dummy stamp',
            tree_id: 'dummy tree id',
            url: 'https://github.com/user/repo/commit/' + id,
        };
    }

    function bench(name: string, value: number, range = '± 20', unit = 'ns/iter') {
        return {
            name,
            range,
            unit,
            value,
        };
    }

    context('with external json file', function() {
        let sandbox: SinonSandbox;
        let publishCommentStub: SinonStub;

        const defaultCfg: Config = {
            name: 'Test benchmark',
            tool: 'benchmarkjs',
            githubToken: undefined,
            baseBenchmarkFilePath: 'dummy',
            prBenchmarkFilePath: 'dummy',
            commentAlways: false,
            commentOnAlert: false,
            alertThreshold: 2.0,
            failOnAlert: true,
            alertCommentCcUsers: ['@user'],
            failThreshold: 2.0,
        };

        const savedRepository = mockedGitHubContext.payload.repository;

        beforeEach(function() {
            sandbox = createSandbox();
            sandbox.stub(core, 'debug');
            sandbox.stub(core, 'warning');
            publishCommentStub = sandbox.stub(git, 'publishComment');
        });

        afterEach(function() {
            sandbox.restore();
            mockedGitHubContext.payload.repository = savedRepository;
        });

        const normalCases: Array<{
            it: string;
            config: Config;
            baseBenchmark: Benchmark;
            prBenchmark: Benchmark;
            error?: string[];
            commitComment?: string;
            undefinedRepoPayload?: boolean;
        }> = [
            {
                it: 'raises an alert when exceeding threshold 2.0',
                config: defaultCfg,
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 100), bench('bench_fib_20', 10000)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 210), bench('bench_fib_20', 25000)], // Exceeds 2.0 threshold
                },
                error: [
                    '# **Performance Alert**',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `bench_fib_10` | `210` ns/iter (`± 20`) | `100` ns/iter (`± 20`) | `2.10` |',
                    '| `bench_fib_20` | `25000` ns/iter (`± 20`) | `10000` ns/iter (`± 20`) | `2.50` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                    '',
                    'CC: @user',
                ],
            },
            {
                it: 'raises an alert with tool whose result value is bigger-is-better',
                config: defaultCfg,
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'benchmarkjs',
                    benches: [bench('benchFib10', 100, '+-20', 'ops/sec')],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'benchmarkjs',
                    benches: [bench('benchFib10', 20, '+-20', 'ops/sec')], // ops/sec so bigger is better
                },
                error: [
                    '# **Performance Alert**',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `benchFib10` | `20` ops/sec (`+-20`) | `100` ops/sec (`+-20`) | `5` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                    '',
                    'CC: @user',
                ],
            },
            {
                it: 'raises an alert without benchmark name with default benchmark name',
                config: { ...defaultCfg, name: 'Benchmark' },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: [
                    '# **Performance Alert**',
                    '',
                    'Possible performance regression was detected for benchmark.',
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `bench_fib_10` | `210` ns/iter (`± 20`) | `100` ns/iter (`± 20`) | `2.10` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                    '',
                    'CC: @user',
                ],
            },
            {
                it: 'raises an alert without CC names',
                config: { ...defaultCfg, alertCommentCcUsers: [] },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'googlecpp',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'googlecpp',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: [
                    '# **Performance Alert**',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `bench_fib_10` | `210` ns/iter (`± 20`) | `100` ns/iter (`± 20`) | `2.10` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                ],
            },
            {
                it: 'sends commit comment on alert with GitHub API',
                config: { ...defaultCfg, commentOnAlert: true, githubToken: 'dummy token' },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                commitComment: 'Comment was generated at https://dummy-comment-url',
            },
            {
                it: 'does not raise an alert when both comment-on-alert and fail-on-alert are disabled',
                config: { ...defaultCfg, commentOnAlert: false, failOnAlert: false },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: undefined,
                commitComment: undefined,
            },
            {
                it: 'ignores other bench case on detecting alerts',
                config: defaultCfg,
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('another_bench', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: undefined,
                commitComment: undefined,
            },
            {
                it:
                    'throws an error when GitHub token is not set (though this case should not happen in favor of validation)',
                config: { ...defaultCfg, commentOnAlert: true },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: ["'comment-on-alert' input is set but 'github-token' input is not set"],
                commitComment: undefined,
            },
            {
                it: 'throws an error when repository payload cannot be obtained from context',
                config: defaultCfg,
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'cargo',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                undefinedRepoPayload: true,
                error: ['Repository information is not available in payload: {}'],
            },
            {
                it: 'changes title when threshold is zero which means comment always happens',
                config: { ...defaultCfg, alertThreshold: 0, failThreshold: 0 },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'benchmarkjs',
                    benches: [bench('benchFib10', 100, '+-20', 'ops/sec')],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'benchmarkjs',
                    benches: [bench('benchFib10', 100, '+-20', 'ops/sec')],
                },
                error: [
                    '# Performance Report',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `0`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `benchFib10` | `100` ops/sec (`+-20`) | `100` ops/sec (`+-20`) | `1` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                    '',
                    'CC: @user',
                ],
            },
            {
                it: 'raises an alert with different failure threshold from alert threshold',
                config: { ...defaultCfg, failThreshold: 3 },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 350)], // Exceeds 3.0 failure threshold
                },
                error: [
                    '1 of 1 alerts exceeded the failure threshold `3` specified by fail-threshold input:',
                    '',
                    '# **Performance Alert**',
                    '',
                    "Possible performance regression was detected for benchmark **'Test benchmark'**.",
                    'Benchmark result of this commit is worse than the previous benchmark result exceeding threshold `2`.',
                    '',
                    '| Benchmark suite | Current: current commit id | Previous: prev commit id | Ratio |',
                    '|-|-|-|-|',
                    '| `bench_fib_10` | `350` ns/iter (`± 20`) | `100` ns/iter (`± 20`) | `3.50` |',
                    '',
                    'This comment was automatically generated by [workflow](https://github.com/user/repo/actions?query=workflow%3AWorkflow%20name).',
                    '',
                    'CC: @user',
                ],
            },
            {
                it: 'does not raise an alert when not exceeding failure threshold',
                config: { ...defaultCfg, failThreshold: 3 },
                baseBenchmark: {
                    commit: commit('prev commit id'),
                    date: lastUpdate - 1000,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 100)],
                },
                prBenchmark: {
                    commit: commit('current commit id'),
                    date: lastUpdate,
                    tool: 'go',
                    benches: [bench('bench_fib_10', 210)], // Exceeds 2.0 threshold
                },
                error: undefined,
            },
        ];

        for (const t of normalCases) {
            it(t.it, async function() {
                if (t.undefinedRepoPayload) {
                    mockedGitHubContext.payload.repository = undefined;
                }

                let caughtError: Error | null = null;
                try {
                    await compareBenchmarkAndAlert(
                        t.prBenchmark,
                        t.baseBenchmark,
                        t.config,
                        mockedGitHubContext as GitHubContext, // missing mocked props should not matter
                    );
                } catch (err) {
                    if (!t.error && !t.commitComment) {
                        throw err;
                    }
                    caughtError = err;
                }

                if (t.error) {
                    ok(caughtError);
                    const expected = t.error.join('\n');
                    eq(expected, caughtError.message);
                }

                if (t.commitComment !== undefined) {
                    sinonAssert.called(publishCommentStub);
                }
            });
        }
    });
});
