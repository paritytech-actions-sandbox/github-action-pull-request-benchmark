# Rust Criterion example for benchmarking with `cargo bench`

## Run benchmarks

Official documentation for usage of `cargo bench` with Criterion:

https://github.com/bheisler/criterion.rs

e.g.

```yaml
- name: Run benchmark
  run: cargo bench -- --output-format bencher | tee output.txt
```

Note that you should run the benchmarks using the bencher output format.


## Process benchmark results

```yaml
- name: Store benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
      tool: 'cargo'
      pr-benchmark-file-path: output.txt
      ...
```

