#!/bin/sh
# Compiles and runs the firmware logic tests on a laptop (needs g++ or clang++).
set -e
cd "$(dirname "$0")"
${CXX:-g++} -std=c++17 -Wall -Wextra -O1 core_test.cpp -o core_test
./core_test
for s in entry_node zone_node; do for f in storega_core.h sha256.h storega_net.h; do
  cmp -s "../common/$f" "../$s/$f" || { echo "✗ ../$s/$f is out of date: run firmware/sync-common.sh"; exit 1; }
done; done
echo "sketch copies of common/*.h are in sync"
# Syntax/type check of the two sketches against mock Arduino headers (does not replace a real ESP32 build).
tmp=$(mktemp -d)
for s in entry_node zone_node; do
  cp "../$s/config.example.h" "$tmp/config.h"
  ${CXX:-g++} -std=gnu++17 -fsyntax-only -Wall -include mock/Arduino.h -Imock -I"$tmp" -I"../$s" -x c++ "../$s/$s.ino"
  echo "$s.ino: syntax check passed (mock Arduino headers)"
done
rm -rf "$tmp"
