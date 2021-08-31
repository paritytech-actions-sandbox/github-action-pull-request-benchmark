JavaScript example for benchmarking with [benchmark.js][tool]
=============================================================

## Run benchmarks

Official documentation for usage of benchmark.js:

https://benchmarkjs.com/

Prepare script `bench.js` as follows:

e.g.

```javascript
const Benchmark = require('benchmark');
const suite = new Benchmark.Suite();

suite
    .add('some test case', () => {
        // ...
    })
    .on('cycle', event => {
        // Output benchmark result by converting benchmark result to string
        console.log(String(event.target));
    })
    .run();
```

Ensure the output includes string values converted from benchmark results.
This action extracts measured values fron the output.

Run the script in workflow:

e.g.

```yaml
- name: Run benchmark
  run: node bench.js | tee output.txt
```

## Process benchmark results

Store the benchmark results with step using the action. Please set `benchmarkjs` to `tool` input.

```yaml
- name: Compare benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
    tool: 'benchmarkjs'
    pr-benchmark-file-path: output.txt
```

[tool]: https://benchmarkjs.com/
