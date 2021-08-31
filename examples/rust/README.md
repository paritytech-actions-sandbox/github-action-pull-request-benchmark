Rust example for benchmarking with `cargo bench`
================================================

## Run benchmarks

Official documentation for usage of `cargo bench`:

https://doc.rust-lang.org/unstable-book/library-features/test.html

e.g.

```yaml
- name: Run benchmark
  run: cargo +nightly bench | tee output.txt
```

Note that `cargo bench` is available only with nightly toolchain.

Note that this example does not use LTO for benchmarking because entire code in benchmark iteration
will be removed as dead code. For normal use case, please enable it in `Cargo.toml` for production
performance.

```yaml
[profile.bench]
lto = true
```

## Process benchmark results

```yaml
- name: Compare benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
    tool: 'cargo'
    pr-benchmark-file-path: output.txt
    ...
```
