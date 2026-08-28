#!/bin/sh
set -eu

repo="joonyeonglim/realistic-job-market-research"
node_bin="$(command -v node || true)"

if [ -z "${RJMR_FORCE_MANAGED_NODE:-}" ] && [ -n "$node_bin" ] && command -v npx >/dev/null 2>&1 && "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  exec npx -y skills add "$repo" --skill realistic-job-market-research -g -a codex -a claude-code -y
fi

case "$(uname -s)" in
  Darwin) node_os="darwin" ;;
  Linux) node_os="linux" ;;
  *) echo "Unsupported OS. On Windows run install.ps1." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) node_arch="arm64" ;;
  x86_64|amd64) node_arch="x64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
esac

cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/realistic-job-market-research/node"
mkdir -p "$cache_root"
base="https://nodejs.org/dist/latest-v24.x"
sums="$(curl -fsSL "$base/SHASUMS256.txt")"
archive="$(printf '%s\n' "$sums" | awk -v suffix="-$node_os-$node_arch.tar.gz" '$2 ~ suffix"$" {print $2; exit}')"
[ -n "$archive" ] || { echo "No official Node archive for $node_os-$node_arch" >&2; exit 1; }
expected="$(printf '%s\n' "$sums" | awk -v file="$archive" '$2 == file {print $1}')"
version_dir="$cache_root/${archive%.tar.gz}"
if [ ! -x "$version_dir/bin/node" ]; then
  tmp="$cache_root/$archive.part"
  curl -fsSL "$base/$archive" -o "$tmp"
  actual="$(if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$tmp" | awk '{print $1}'; else sha256sum "$tmp" | awk '{print $1}'; fi)"
  [ "$actual" = "$expected" ] || { echo "Node SHA-256 mismatch" >&2; exit 1; }
  rm -rf "$version_dir"
  mkdir -p "$version_dir"
  tar -xzf "$tmp" -C "$version_dir" --strip-components=1
  rm -f "$tmp"
fi

exec "$version_dir/bin/node" "$version_dir/lib/node_modules/npm/bin/npx-cli.js" -y skills add "$repo" --skill realistic-job-market-research -g -a codex -a claude-code -y
