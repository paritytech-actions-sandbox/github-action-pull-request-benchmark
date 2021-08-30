import { strict as A } from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { createSandbox } from 'sinon';

type Inputs = { [name: string]: string };

const inputs: Inputs = {};
function mockInputs(newInputs: Inputs) {
    for (const name of Object.getOwnPropertyNames(inputs)) {
        delete inputs[name];
    }
    Object.assign(inputs, newInputs);
}

const getMockedInput = (name: string): string => inputs[name];

// This line must be called after mocking
import { configFromJobInput, VALID_TOOLS } from '../src/config';

describe('configFromJobInput()', function() {
    const rootDir = process.cwd();
    const sandbox = createSandbox();

    before(function() {
        sandbox.stub(core, 'getInput').callsFake(getMockedInput);
        process.chdir(path.join(rootDir, 'test', 'data', 'config'));
    });

    after(function() {
        sandbox.restore();
        process.chdir(rootDir);
    });

    const defaultInputs = {
        name: 'Benchmark',
        tool: 'cargo',
        'pr-benchmark-file-path': 'out.txt',
        'base-benchmark-file-path': 'out.txt',
        'github-token': '',
        'comment-on-alert': 'false',
        'alert-threshold': '200%',
        'fail-on-alert': 'false',
        'alert-comment-cc-users': '',
    };

    const validation_tests = [
        {
            what: 'wrong name',
            inputs: { ...defaultInputs, name: '' },
            expected: /^Error: Name must not be empty$/,
        },
        {
            what: 'wrong tool',
            inputs: { ...defaultInputs, tool: 'foo' },
            expected: /^Error: Invalid value 'foo' for 'tool' input/,
        },
        {
            what: 'benchmark file does not exist',
            inputs: { ...defaultInputs, 'pr-benchmark-file-path': 'foo.txt' },
            expected: /^Error: Invalid value for 'pr-benchmark-file-path'/,
        },
        {
            what: 'benchmark file is actually directory',
            inputs: { ...defaultInputs, 'pr-benchmark-file-path': '.' },
            expected: /Specified path '.*' is not a file/,
        },
        {
            what: 'alert-threshold does not have percentage value',
            inputs: { ...defaultInputs, 'alert-threshold': '1.2' },
            expected: /'alert-threshold' input must ends with '%' for percentage value/,
        },
        {
            what: 'alert-threshold does not have correct percentage number',
            inputs: { ...defaultInputs, 'alert-threshold': 'foo%' },
            expected: /Specified value 'foo' in 'alert-threshold' input cannot be parsed as float number/,
        },
        {
            what: 'comment-on-alert is set but github-token is not set',
            inputs: { ...defaultInputs, 'comment-on-alert': 'true', 'github-token': '' },
            expected: /'comment-on-alert' is enabled but 'github-token' is not set/,
        },
        {
            what: 'user names in alert-comment-cc-users is not starting with @',
            inputs: { ...defaultInputs, 'alert-comment-cc-users': '@foo,bar' },
            expected: /User name in 'alert-comment-cc-users' input must start with '@' but got 'bar'/,
        },
        {
            what: 'alert-threshold must not be empty',
            inputs: {
                ...defaultInputs,
                'alert-threshold': '',
            },
            expected: /'alert-threshold' input must not be empty/,
        },
        {
            what: 'fail-threshold does not have percentage value',
            inputs: { ...defaultInputs, 'fail-threshold': '1.2' },
            expected: /'fail-threshold' input must ends with '%' for percentage value/,
        },
        {
            what: 'fail-threshold does not have correct percentage number',
            inputs: { ...defaultInputs, 'fail-threshold': 'foo%' },
            expected: /Specified value 'foo' in 'fail-threshold' input cannot be parsed as float number/,
        },
        {
            what: 'fail-threshold is smaller than alert-threshold',
            inputs: { ...defaultInputs, 'alert-threshold': '150%', 'fail-threshold': '120%' },
            expected: /'alert-threshold' value must be smaller than 'fail-threshold' value but got 1.5 > 1.2/,
        },
    ] as Array<{
        what: string;
        inputs: Inputs;
        expected: RegExp;
    }>;

    for (const test of validation_tests) {
        it('validates ' + test.what, async function() {
            mockInputs(test.inputs);
            await A.rejects(configFromJobInput, test.expected);
        });
    }

    interface ExpectedResult {
        name: string;
        tool: string;
        githubToken?: string;
        commentOnAlert: boolean;
        alertThreshold: number;
        failOnAlert: boolean;
        alertCommentCcUsers: string[];
        failThreshold: number | null;
    }

    const defaultExpected: ExpectedResult = {
        name: 'Benchmark',
        tool: 'cargo',
        githubToken: undefined,
        commentOnAlert: false,
        alertThreshold: 2,
        failOnAlert: false,
        alertCommentCcUsers: [],
        failThreshold: null,
    };

    const returnedConfigTests = [
        ...Array.from(VALID_TOOLS).map((tool: string) => ({
            what: 'valid tool ' + tool,
            inputs: { ...defaultInputs, tool },
            expected: { ...defaultExpected, tool },
        })),
        ...([
            ['comment-on-alert', 'commentOnAlert'],
            ['fail-on-alert', 'failOnAlert'],
        ] as const)
            .map(([name, prop]) =>
                ['true', 'false'].map(v => ({
                    what: `boolean input ${name} set to '${v}'`,
                    inputs: { ...defaultInputs, 'github-token': 'dummy', [name]: v },
                    expected: { ...defaultExpected, githubToken: 'dummy', [prop]: v === 'true' },
                })),
            )
            .flat(),
        {
            what: 'with specified name',
            inputs: { ...defaultInputs, name: 'My Name is...' },
            expected: { ...defaultExpected, name: 'My Name is...' },
        },
        ...[
            ['150%', 1.5],
            ['0%', 0],
            ['123.4%', 1.234],
        ].map(([v, e]) => ({
            what: `with alert threshold ${v}`,
            inputs: { ...defaultInputs, 'alert-threshold': v },
            expected: { ...defaultExpected, alertThreshold: e },
        })),
        ...[
            ['@foo', ['@foo']],
            ['@foo,@bar', ['@foo', '@bar']],
            ['@foo, @bar ', ['@foo', '@bar']],
        ].map(([v, e]) => ({
            what: `with comment CC users ${v}`,
            inputs: { ...defaultInputs, 'alert-comment-cc-users': v },
            expected: { ...defaultExpected, alertCommentCcUsers: e },
        })),
        {
            what: 'different failure threshold from alert threshold',
            inputs: { ...defaultInputs, 'fail-threshold': '300%' },
            expected: { ...defaultExpected, failThreshold: 3.0 },
        },
        {
            what: 'boolean value parsing an empty input as false',
            inputs: {
                ...defaultInputs,
                'comment-on-alert': '',
                'fail-on-alert': '',
            },
            expected: defaultExpected,
        },
    ] as Array<{
        what: string;
        inputs: Inputs;
        expected: ExpectedResult;
    }>;

    for (const test of returnedConfigTests) {
        it('returns validated config with ' + test.what, async function() {
            mockInputs(test.inputs);
            const actual = await configFromJobInput();
            A.equal(actual.name, test.expected.name);
            A.equal(actual.tool, test.expected.tool);
            A.equal(actual.githubToken, test.expected.githubToken);
            A.equal(actual.commentOnAlert, test.expected.commentOnAlert);
            A.equal(actual.failOnAlert, test.expected.failOnAlert);
            A.equal(actual.alertThreshold, test.expected.alertThreshold);
            A.deepEqual(actual.alertCommentCcUsers, test.expected.alertCommentCcUsers);
            A.ok(path.isAbsolute(actual.prBenchmarkFilePath), actual.prBenchmarkFilePath);
            A.ok(path.isAbsolute(actual.baseBenchmarkFilePath), actual.baseBenchmarkFilePath);
            if (test.expected.failThreshold === null) {
                A.equal(actual.failThreshold, test.expected.alertThreshold);
            } else {
                A.equal(actual.failThreshold, test.expected.failThreshold);
            }
        });
    }

    it('resolves relative paths in config', async function() {
        mockInputs({
            ...defaultInputs,
            'output-file-path': 'out.txt',
            'benchmark-data-dir-path': 'path/to/output',
        });

        const config = await configFromJobInput();
        A.equal(config.name, 'Benchmark');
        A.equal(config.tool, 'cargo');
        A.ok(path.isAbsolute(config.prBenchmarkFilePath), config.prBenchmarkFilePath);
        A.ok(path.isAbsolute(config.baseBenchmarkFilePath), config.baseBenchmarkFilePath);
    });

    it('does not change abusolute paths in config', async function() {
        const outFile = path.resolve('out.txt');
        mockInputs({
            ...defaultInputs,
            'pr-benchmark-file-path': outFile,
            'base-benchmark-file-path': outFile,
        });

        const config = await configFromJobInput();
        A.equal(config.prBenchmarkFilePath, outFile);
        A.equal(config.baseBenchmarkFilePath, outFile);
    });

    it('resolves home directory in output directory path', async function() {
        const home = os.homedir();
        const absCwd = process.cwd();
        if (!absCwd.startsWith(home)) {
            // Test was not run under home directory so "~" in paths cannot be tested
            this.skip();
        }

        const cwd = path.join('~', absCwd.slice(home.length));
        const file = path.join(cwd, 'out.txt');

        mockInputs({
            ...defaultInputs,
            'pr-benchmark-file-path': file,
            'base-benchmark-file-path': file,
        });

        const config = await configFromJobInput();
        A.ok(path.isAbsolute(config.prBenchmarkFilePath), config.prBenchmarkFilePath);
        A.equal(config.prBenchmarkFilePath, path.join(absCwd, 'out.txt'));
        A.ok(path.isAbsolute(config.baseBenchmarkFilePath), config.baseBenchmarkFilePath);
        A.equal(config.baseBenchmarkFilePath, path.join(absCwd, 'out.txt'));
    });
});
