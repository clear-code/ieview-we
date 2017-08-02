#!/usr/bin/env bash

#set -x

dist_dir="$(cd "$(dirname "$0")" && pwd)"
temp_src="src/temp_ieview_we"

if go version 2>&1 >/dev/null
then
  echo "using $(go version)"
else
  echo 'ERROR: golang is missing.' 1>&2
  exit 1
fi

if [ "$GOPATH" = '' ]
then
  echo 'ERROR: You must set GOPATH environment variable before you run this script.' 1>&2
  exit 1
fi

if [ -d "$temp_src" ]
then
  echo "ERROR: You must remove previous '$temp_src' before building." 1>&2
  exit 1
fi

main() {
  cd "$GOPATH"

  echo "preparing dependencies..."
  # prepare_dependency github.com/clear-code/ieview-we
  mkdir -p "$temp_src"
  ln -s "$dist_dir" "$temp_src/host"
  prepare_dependency golang.org/x/sys/windows/registry
  prepare_dependency github.com/lhside/chrome-go
  prepare_dependency github.com/robertkrimen/otto
  prepare_dependency github.com/claer-code/mcd-go

  build_for 386
  build_for amd64

  rm "$temp_src/host"
  rm -rf "$temp_src"

  echo "done."
}

prepare_dependency() {
  local path="$1"
  [ -d "src/$path" ] || go get "$path"
}

build_for() {
  local arch="$1"
  local path="$(echo "$temp_src" | sed 's;^src/;;')/host"
  echo "building for $arch..."
  env GOOS=windows GOARCH="$1" go build "$path"
  mkdir -p "$dist_dir/$arch"
  mv host.exe "$dist_dir/$arch/"
}

main
