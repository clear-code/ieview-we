#!/usr/bin/env bash

dist_dir="$(cd "$(dirname "$0")" && pwd)"

cd "$GOHOME"

[ -d src/github.com/clear-code/ieview-we ] || go get github.com/clear-code/ieview-we
[ -d src/golang.org/x/sys/windows/registry ] || go get golang.org/x/sys/windows/registry
[ -d src/github.com/lhside/chrome-go ] || go get github.com/lhside/chrome-go

GOOS=windows GOARCH=386 go build github.com/clear-code/ieview-we/host
mkdir -p "$dist_dir/386"
mv host.exe "$dist_dir/386/"

GOOS=windows GOARCH=amd64 go build github.com/clear-code/ieview-we/host
mkdir -p "$dist_dir/amd64"
mv host.exe "$dist_dir/amd64/"

