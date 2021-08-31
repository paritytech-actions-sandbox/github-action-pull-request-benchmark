C++ example for benchmarking with [Catch2 Framework][tool]
====================================================================

## Run benchmarks

Official documentation for usage of Catch2 Framework can be found in its repository:

https://github.com/catchorg/Catch2

Since Catch2 is a header-only test framework, you don't need to build it in advance.
Download and put the headers in your `include` directory and write your benchmarks.

```cpp
#define CATCH_CONFIG_MAIN
#include <catch2/catch.hpp>

TEST_CASE("Fibonacci") {
  // now let's benchmark:
  BENCHMARK("Some benchmark") {
      // Your benchmark goes here
  };
}
```

Build the source with C++ compiler and run the built executable to get the benchmark output.
Ensure to use `console` reporter for this. `xml` reporter may be supported in the future.



## Process benchmark results

```yaml
- name: Compare benchmark result
  uses: larabr/github-action-benchmark@v1
  with:
    tool: 'catch2'
    pr-benchmark-file-path: benchmark_result.json
    ...
```


## Run this example

To try this example, please use [cmake](./CMakeLists.txt) and `clang++`.

```sh
$ mkdir build
$ cd build
$ cmake -DCMAKE_BUILD_TYPE=Release ..
$ cmake --build . --config Release
```

This will create `Catch2_bench` executable. The results are output to stdout.

[tool]: https://github.com/catchorg/Catch2
