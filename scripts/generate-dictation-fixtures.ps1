$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "benchmarks\dictation-corpus.json"
$audioDirectory = Join-Path $root "benchmarks\audio"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $audioDirectory -Force | Out-Null

function Write-PcmWave {
  param(
    [string]$Path,
    [int]$Seconds,
    [switch]$Noise
  )
  $sampleRate = 16000
  $sampleCount = $sampleRate * $Seconds
  $random = [System.Random]::new(8008)
  $stream = [System.IO.File]::Create($Path)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $dataBytes = $sampleCount * 2
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
    $writer.Write(36 + $dataBytes)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("WAVEfmt "))
    $writer.Write(16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write($sampleRate)
    $writer.Write($sampleRate * 2)
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
    $writer.Write($dataBytes)
    for ($index = 0; $index -lt $sampleCount; $index++) {
      $sample = if ($Noise) { [int16]$random.Next(-500, 501) } else { [int16]0 }
      $writer.Write($sample)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  foreach ($fixture in $manifest.fixtures) {
    $path = Join-Path $root ("benchmarks\" + $fixture.file.Replace("/", "\"))
    switch ($fixture.kind) {
      "speech" {
        $synthesizer.SelectVoice($fixture.voice)
        $synthesizer.Rate = $fixture.rate
        $synthesizer.SetOutputToWaveFile($path, $format)
        $synthesizer.Speak($fixture.transcript)
        $synthesizer.SetOutputToNull()
      }
      "noise" { Write-PcmWave -Path $path -Seconds 4 -Noise }
      "short-silence" { Write-PcmWave -Path $path -Seconds 1 }
      default { Write-PcmWave -Path $path -Seconds 4 }
    }
  }
} finally {
  $synthesizer.Dispose()
}

Write-Host "Generated $($manifest.fixtures.Count) deterministic dictation fixtures."
