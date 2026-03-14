$ErrorActionPreference = "Stop"

$backendDir = "d:\HealthEcho\healthecho-backend"
Set-Location $backendDir
$ollamaExe = "C:\Users\USER\AppData\Local\Programs\Ollama\ollama.exe"

if (!(Test-Path ".venv\Scripts\python.exe")) {
  throw "Backend venv not found. Run: python -m venv .venv"
}

if (!(Test-Path ".env")) {
  Copy-Item .env.example .env
}

if (Test-Path $ollamaExe) {
  $ollamaDir = Split-Path $ollamaExe -Parent
  if ($env:PATH -notlike "*$ollamaDir*") {
    $env:PATH = "$ollamaDir;$env:PATH"
  }

  $ollamaHealthy = $false
  try {
    $null = Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 3
    $ollamaHealthy = $true
  } catch {}

  if (-not $ollamaHealthy) {
    Write-Host "Starting Ollama server..." -ForegroundColor Yellow
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 3
  }

  $envFile = Get-Content ".env" -ErrorAction SilentlyContinue
  $modelLine = $envFile | Where-Object { $_ -match "^OLLAMA_MODEL=" } | Select-Object -First 1
  $ollamaModel = if ($modelLine) { ($modelLine -split "=", 2)[1].Trim() } else { "mistral" }

  try {
    & $ollamaExe show $ollamaModel 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Pulling Ollama model: $ollamaModel (first time may take a while)..." -ForegroundColor Yellow
      & $ollamaExe pull $ollamaModel | Out-Host
    }
  } catch {
    Write-Host "Ollama found but model check/pull failed. Backend may use fallback responses." -ForegroundColor Yellow
  }
} else {
  Write-Host "Ollama executable not found at: $ollamaExe" -ForegroundColor Yellow
}

Write-Host "Starting HealthEcho backend on http://127.0.0.1:8000"
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000 --reload
