.PHONY: all install build test toolchain guest-toolchain bun run release clean

all: build

install:
	bun install --frozen-lockfile --ignore-scripts

build:
	bun run build

test:
	bun run test

toolchain:
	bun run test:toolchain

guest-toolchain:
	bun run test:guest-toolchain

bun:
	bun run test:bun

run:
	bun run mikuos.ts


release:
	bun run release:source

clean:
	bun run clean
