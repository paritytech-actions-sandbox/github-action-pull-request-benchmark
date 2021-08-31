Go example for benchmarking with `go test -bench`
=================================================

## Run benchmarks

Official documentation for usage of `go test -bench`:

https://golang.org/pkg/testing/#hdr-Benchmarks

e.g.

```yaml
- name: Run benchmark
  run: go test -bench 'Benchmark' | tee output.txt
```

## Process benchmark results

```yaml
- name: Compare benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
    tool: 'go'
    pr-benchmark-file-path: output.txt
```
