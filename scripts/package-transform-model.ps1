$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$modelName = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
$model = Join-Path $repo "src-tauri\resources\models\$modelName"
$readme = Join-Path $repo "packaging\TRANSFORM_MODEL_README.txt"
$version = (Get-Content -Raw (Join-Path $repo "package.json") | ConvertFrom-Json).version
$bundle = Join-Path $repo "src-tauri\target\release\bundle"
$output = Join-Path $bundle "REDLINE_Transform_Model_${version}_offline.zip"
$expectedBytes = 1117320736
$expectedHash = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"

if (-not (Test-Path -LiteralPath $model)) {
  throw "Transform model not found: $model"
}
if ((Get-Item -LiteralPath $model).Length -ne $expectedBytes) {
  throw "Transform model size does not match the pinned release model."
}
$stream = [System.IO.File]::OpenRead($model)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $actualHash = [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace("-", "").ToLowerInvariant()
} finally {
  $stream.Dispose()
  if ($null -ne $sha256) {
    $sha256.Dispose()
  }
}
if ($actualHash -ne $expectedHash) {
  throw "Transform model hash does not match the pinned release model."
}

New-Item -ItemType Directory -Force -Path $bundle | Out-Null
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("redline-transform-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path (Join-Path $staging "models") | Out-Null
  Copy-Item -LiteralPath $readme -Destination (Join-Path $staging "README.txt")
  Copy-Item -LiteralPath $model -Destination (Join-Path $staging "models\$modelName")
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output
  }
  & tar.exe -a -c -f $output -C $staging README.txt models
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the offline Transform package."
  }
} finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
  }
}

Get-Item -LiteralPath $output | Select-Object FullName, Length
