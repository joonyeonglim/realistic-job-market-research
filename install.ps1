$ErrorActionPreference = "Stop"
$repo = "joonyeonglim/realistic-job-market-research"

if (-not $env:RJMR_FORCE_MANAGED_NODE -and (Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npx -ErrorAction SilentlyContinue)) {
  $major = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
  if ($major -ge 20) {
    & npx -y skills add $repo --skill realistic-job-market-research -g -a codex -a claude-code -y
    exit $LASTEXITCODE
  }
}

$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "arm64" } else { "x64" }
$base = "https://nodejs.org/dist/latest-v24.x"
$sums = (Invoke-WebRequest "$base/SHASUMS256.txt").Content -split "`n"
$line = $sums | Where-Object { $_ -match "node-v.+-win-$arch.zip$" } | Select-Object -First 1
if (-not $line) { throw "No official Node archive for Windows $arch" }
$parts = $line.Trim() -split "\s+"
$expected, $archive = $parts[0], $parts[1]
$cacheRoot = Join-Path $env:LOCALAPPDATA "realistic-job-market-research\node"
$versionDir = Join-Path $cacheRoot ($archive -replace "\.zip$", "")
$nodeExe = Join-Path $versionDir "node.exe"

if (-not (Test-Path $nodeExe)) {
  New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
  $tmp = Join-Path $cacheRoot "$archive.part"
  Invoke-WebRequest "$base/$archive" -OutFile $tmp
  $actual = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected.ToLowerInvariant()) { throw "Node SHA-256 mismatch" }
  if (Test-Path $versionDir) { Remove-Item -Recurse -Force $versionDir }
  Expand-Archive $tmp $cacheRoot -Force
  Remove-Item $tmp
}

$npx = Join-Path $versionDir "node_modules\npm\bin\npx-cli.js"
& $nodeExe $npx -y skills add $repo --skill realistic-job-market-research -g -a codex -a claude-code -y
exit $LASTEXITCODE
