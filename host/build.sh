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
  build_host
  prepare_msi_sources
}

build_host() {
  cd "$GOPATH"

  echo "preparing dependencies..."
  prepare_dependency github.com/mitchellh/gox
  prepare_dependency golang.org/x/sys/windows/registry
  prepare_dependency github.com/lhside/chrome-go
  prepare_dependency github.com/robertkrimen/otto
  prepare_dependency github.com/clear-code/mcd-go
  prepare_dependency github.com/lestrrat/go-file-rotatelogs
  mkdir -p "$temp_src"
  ln -s "$dist_dir" "$temp_src/host"

  addon_version="$(cat "$dist_dir/../manifest.json" | jq -r .version)"
  echo "version is ${addon_version}"
  sed -i -r -e "s/^(const VERSION = \")[^\"]*(\")/\1${addon_version}\2/" "$temp_src/host/host.go"

  local path="$(echo "$temp_src" | sed 's;^src/;;')/host"
  gox -os="windows" "$path"

  local arch
  for binary in *.exe
  do
    arch="$(basename "$binary" '.exe' | sed 's/.\+_windows_//')"
    mkdir -p "$dist_dir/$arch"
    mv "$binary" "$dist_dir/$arch/host.exe"
  done

  rm "$temp_src/host"
  rm -rf "$temp_src"

  echo "done."
}

prepare_dependency() {
  local path="$1"
  [ -d "src/$path" ] || go get "$path"
}

prepare_msi_sources() {
  cd "$dist_dir"

  product_name="$(cat wix.json | jq -r .product)"
  host_name="$(ls *.json | grep -E -v 'wix.json|chrome.json|edge.json' | sed -r -e 's/.json$//')"
  vendor_name="$(cat wix.json | jq -r .company)"
  addon_version="$(cat ../manifest.json | jq -r .version)"
  upgrade_code_guid="$(cat wix.json | jq -r '."upgrade-code"')"
  files_guid="$(cat wix.json | jq -r .files.guid)"
  env_guid="$(cat wix.json | jq -r .env.guid)"

  cat templates/product.wxs.template |
    sed -r -e "s/%PRODUCT%/${product_name}/g" \
           -e "s/%NAME%/${host_name}/g" \
           -e "s/%VENDOR%/${vendor_name}/g" \
           -e "s/%VERSION%/${addon_version}/g" \
           -e "s/%UPGRADE_CODE_GUID%/${upgrade_code_guid}/g" \
           -e "s/%FILES_GUID%/${files_guid}/g" \
           -e "s/%ENV_GUID%/${env_guid}/g" \
      > templates/product.wxs

  build_msi_bat="build_msi.bat"
  msi_basename="lst-addons-in-win-programs-nmh"

  rm -f "$build_msi_bat"
  touch "$build_msi_bat"
  echo -e "set MSITEMP=%USERPROFILE%\\\\temp%RANDOM%\r" >> "$build_msi_bat"
  echo -e "set SOURCE=%~dp0\r" >> "$build_msi_bat"
  echo -e "xcopy \"%SOURCE%\\*\" \"%MSITEMP%\" /S /I \r" >> "$build_msi_bat"
  echo -e "cd \"%MSITEMP%\" \r" >> "$build_msi_bat"
  echo -e "copy 386\\host.exe \"%cd%\\\" \r" >> "$build_msi_bat"
  echo -e "go-msi.exe make --msi ${msi_basename}-386.msi --version ${addon_version} --src templates --out \"%cd%\\outdir\" --arch 386 \r" >> "$build_msi_bat"
  echo -e "del host.exe \r" >> "$build_msi_bat"
  echo -e "copy amd64\\host.exe \"%cd%\\\" \r" >> "$build_msi_bat"
  echo -e "go-msi.exe make --msi ${msi_basename}-amd64.msi --version ${addon_version} --src templates --out \"%cd%\\outdir\" --arch amd64 \r" >> "$build_msi_bat"
  echo -e "xcopy *.msi \"%SOURCE%\" /I /Y \r" >> "$build_msi_bat"
  echo -e "cd \"%SOURCE%\" \r" >> "$build_msi_bat"
  echo -e "rd /S /Q \"%MSITEMP%\" \r" >> "$build_msi_bat"
}

main
