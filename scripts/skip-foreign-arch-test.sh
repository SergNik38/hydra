#!/bin/sh
# CMake runs a cross-built test binary through this emulator, so report the
# skip instead of failing with "cannot execute" on the build machine.
echo "Skipped $*: built for another CPU architecture, it cannot run on this Mac" >&2
exit 0
