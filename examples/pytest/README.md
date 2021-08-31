Python example for benchmarking with [pytest-benchmark][tool]
=============================================================

## Run benchmarks

Official documentation for usage of pytest-benchmark:

https://pytest-benchmark.readthedocs.io/en/stable/

Install dependencies with `venv` package using Python3.

```sh
$ python -m venv venv
$ source venv/bin/activate
$ pip install pytest pytest-benchmark
```

Prepare `bench.py` as follows:

e.g.

```python
import pytest

def some_test_case(benchmark):
    benchmark(some_func, args)
```

And run benchmarks with `--benchmark-json` in workflow. The JSON file will be an input to
github-action-benchmark.

e.g.

```yaml
- name: Run benchmark
  run: pytest bench.py --benchmark-json output.json
```

## Process benchmark results

```yaml
- name: Compare benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
    tool: 'pytest'
    pr-benchmark-file-path: output.json
    ...
```
