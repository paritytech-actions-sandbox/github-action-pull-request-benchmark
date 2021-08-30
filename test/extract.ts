import * as path from 'path';
import { strict as A } from 'assert';
import { ToolType } from '../src/config';
import { BenchmarkResult, extractResult } from '../src/extract';
import { getLatestPRCommit, GitHubContext, PayloadRepository } from '../src/git';

const mockedGitHubContext = ({
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
        pull_request: {
            title: 'title',
            html_url: 'https://github.com/user/repo',
            head: {
                user: {
                    login: 'pr user',
                },
                sha: '123456789abcdef',
                message: 'this is dummy',
                repo: {
                    updated_at: 'dummy timestamp',
                    html_url: 'https://github.com/pr_user/repo/commits/1',
                },
            },
            // base: {
            //     user: {
            //         login: 'base_user',
            //     },
            //     id: 'abcdef123456789',
            //     label: 'dummy/base',
            //     repo: {
            //         updated_at: 'dummy timestamp',
            //         html_url: 'https://github.com/dummy/base',
            //     },
            // },
        },
    },
    workflow: 'Workflow name',
} as unknown) as GitHubContext;

describe('extractResult()', function() {
    const rootDir = process.cwd();

    const normalCases: Array<{
        tool: ToolType;
        expected: BenchmarkResult[];
        file?: string;
    }> = [
        {
            tool: 'cargo',
            expected: [
                {
                    name: 'bench_fib_10',
                    range: '± 24',
                    unit: 'ns/iter',
                    value: 135,
                },
                {
                    name: 'bench_fib_20',
                    range: '± 755',
                    unit: 'ns/iter',
                    value: 18149,
                },
            ],
        },
        {
            tool: 'catch2',
            expected: [
                {
                    name: 'Fibonacci 10',
                    range: '± 19',
                    unit: 'ns',
                    value: 344,
                    extra: '100 samples\n208 iterations',
                },
                {
                    name: 'Fibonacci 20',
                    range: '± 3.256',
                    unit: 'us',
                    value: 41.731,
                    extra: '100 samples\n2 iterations',
                },
                {
                    name: 'Fibonacci~ 5!',
                    range: '± 4',
                    unit: 'ns',
                    value: 36,
                    extra: '100 samples\n1961 iterations',
                },
                {
                    name: 'Fibonacci-15_bench',
                    range: '± 362',
                    unit: 'us',
                    value: 3.789,
                    extra: '100 samples\n20 iterations',
                },
            ],
        },
        {
            tool: 'go',
            expected: [
                {
                    name: 'BenchmarkFib10',
                    unit: 'ns/op',
                    value: 325,
                    extra: '5000000 times\n8 procs',
                },
                {
                    name: 'BenchmarkFib20',
                    unit: 'ns/op',
                    value: 40537.123,
                    extra: '30000 times',
                },
            ],
        },
        {
            tool: 'benchmarkjs',
            expected: [
                {
                    name: 'fib(10)',
                    range: '±0.74%',
                    unit: 'ops/sec',
                    value: 1431759,
                    extra: '93 samples',
                },
                {
                    name: 'fib(20)',
                    range: '±0.32%',
                    unit: 'ops/sec',
                    value: 12146,
                    extra: '96 samples',
                },
                {
                    name: 'createObjectBuffer with 200 comments',
                    range: '±1.70%',
                    unit: 'ops/sec',
                    value: 81.61,
                    extra: '69 samples',
                },
            ],
        },
        {
            tool: 'pytest',
            expected: [
                {
                    name: 'bench.py::test_fib_10',
                    range: 'stddev: 0.000006175090189861328',
                    unit: 'iter/sec',
                    value: 41513.272817492856,
                    extra: 'mean: 24.08868133322941 usec\nrounds: 38523',
                },
                {
                    name: 'bench.py::test_fib_20',
                    range: 'stddev: 0.0001745301654140968',
                    unit: 'iter/sec',
                    value: 335.0049328331567,
                    extra: 'mean: 2.9850306726618627 msec\nrounds: 278',
                },
            ],
        },
        {
            tool: 'googlecpp',
            expected: [
                {
                    extra: 'iterations: 3070566\ncpu: 213.65507206163295 ns\nthreads: 1',
                    name: 'fib_10',
                    unit: 'ns/iter',
                    value: 214.98980114547953,
                },
                {
                    extra: 'iterations: 23968\ncpu: 27364.90320427236 ns\nthreads: 1',
                    name: 'fib_20',
                    unit: 'ns/iter',
                    value: 27455.600415007055,
                },
            ],
        },
        {
            tool: 'pytest',
            file: 'pytest_several_units.json',
            expected: [
                {
                    extra: 'mean: 149.95610248628836 nsec\nrounds: 68536',
                    name: 'bench.py::test_fib_1',
                    range: 'stddev: 2.9351731952139377e-8',
                    unit: 'iter/sec',
                    value: 6668618.238403659,
                },
                {
                    name: 'bench.py::test_fib_10',
                    range: 'stddev: 0.000005235937482008476',
                    unit: 'iter/sec',
                    value: 34652.98828915334,
                    extra: 'mean: 28.85754012484424 usec\nrounds: 20025',
                },
                {
                    name: 'bench.py::test_fib_20',
                    range: 'stddev: 0.0003737982822178215',
                    unit: 'iter/sec',
                    value: 276.8613383807958,
                    extra: 'mean: 3.611916368852473 msec\nrounds: 122',
                },
                {
                    extra: 'mean: 2.0038430469999997 sec\nrounds: 5',
                    name: 'bench.py::test_sleep_2',
                    range: 'stddev: 0.0018776587251587858',
                    unit: 'iter/sec',
                    value: 0.49904108083570886,
                },
            ],
        },
        {
            tool: 'catch2',
            file: 'issue16_output.txt',
            expected: [
                {
                    extra: '100 samples\n76353 iterations',
                    name: 'Fibonacci 10',
                    range: '± 0',
                    unit: 'ns',
                    value: 0,
                },
                {
                    extra: '100 samples\n75814 iterations',
                    name: 'Fibonacci 20',
                    range: '± 0',
                    unit: 'ns',
                    value: 1,
                },
            ],
        },
    ];

    for (const test of normalCases) {
        it('extracts benchmark output from ' + test.tool, async function() {
            const file = test.file ?? `${test.tool}_output.txt`;
            const outputFilePath = path.join(rootDir, 'test', 'data', 'extract', file);
            const config = {
                tool: test.tool,
                outputFilePath,
            };
            const bench = await extractResult(
                config.outputFilePath,
                config.tool,
                getLatestPRCommit(mockedGitHubContext),
            );

            A.equal(bench.commit.id, mockedGitHubContext!.payload!.pull_request!.head.sha);
            A.ok(bench.date <= Date.now(), bench.date.toString());
            A.equal(bench.tool, test.tool);
            A.deepEqual(test.expected, bench.benches);
        });
    }

    it('raises an error on unexpected tool', async function() {
        const config = {
            tool: 'foo',
            outputFilePath: path.join(rootDir, 'test', 'data', 'extract', 'go_output.txt'),
        };
        await A.rejects(
            extractResult(config.outputFilePath, config.tool, getLatestPRCommit(mockedGitHubContext)),
            /^Error: FATAL: Unexpected tool: 'foo'$/,
        );
    });

    it('raises an error when output file is not readable', async function() {
        const config = {
            tool: 'go',
            outputFilePath: 'path/does/not/exist.txt',
        };
        await A.rejects(extractResult(config.outputFilePath, config.tool, getLatestPRCommit(mockedGitHubContext)));
    });

    it('raises an error when no output found', async function() {
        const config = {
            tool: 'cargo',
            outputFilePath: path.join(rootDir, 'test', 'data', 'extract', 'go_output.txt'),
        };
        await A.rejects(
            extractResult(config.outputFilePath, config.tool, getLatestPRCommit(mockedGitHubContext)),
            /^Error: No benchmark result was found in /,
        );
    });

    const toolSpecificErrorCases: Array<{
        it: string;
        tool: ToolType;
        file: string;
        expected: RegExp;
    }> = [
        ...(['pytest', 'googlecpp'] as const).map(tool => ({
            it: `raises an error when output file is not in JSON with tool '${tool}'`,
            tool,
            file: 'go_output.txt',
            expected: /must be JSON file/,
        })),
    ];

    for (const t of toolSpecificErrorCases) {
        it(t.it, async function() {
            // Note: go_output.txt is not in JSON format!
            const outputFilePath = path.join(rootDir, 'test', 'data', 'extract', t.file);
            const config = { tool: t.tool, outputFilePath };
            await A.rejects(
                extractResult(config.outputFilePath, config.tool, getLatestPRCommit(mockedGitHubContext)),
                t.expected,
            );
        });
    }

    it('collects the commit information from pull_request payload as fallback', async function() {
        const dummyGitHubContext = ({
            ...mockedGitHubContext,
            payload: {
                pull_request: {
                    title: 'this is title',
                    html_url: 'https://github.com/dummy/repo/pull/1',
                    head: {
                        sha: 'abcdef0123456789',
                        user: {
                            login: 'user',
                        },
                        repo: {
                            updated_at: 'repo updated at timestamp',
                        },
                    },
                },
            },
        } as unknown) as GitHubContext;
        const outputFilePath = path.join(rootDir, 'test', 'data', 'extract', 'go_output.txt');
        const config = {
            tool: 'go',
            outputFilePath,
        };
        const { commit } = await extractResult(
            config.outputFilePath,
            config.tool,
            getLatestPRCommit(dummyGitHubContext),
        );
        const expectedUser = {
            name: 'user',
            username: 'user',
        };
        A.deepEqual(commit.author, expectedUser);
        A.deepEqual(commit.committer, expectedUser);
        A.equal(commit.id, 'abcdef0123456789');
        A.equal(commit.message, 'this is title');
        A.equal(commit.timestamp, 'repo updated at timestamp');
        A.equal(commit.url, 'https://github.com/dummy/repo/pull/1/commits/abcdef0123456789');
    });
});
