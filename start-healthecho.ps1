$ErrorActionPreference = "Stop"

$root = "d:\HealthEcho"
$backend = Join-Path $root "healthecho-backend"
$frontend = Join-Path $root "healthecho-frontend"

Write-Host "Starting HealthEcho..." -ForegroundColor Cyan

$ollamaExeCandidates = @(
  "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
  "C:\Users\USER\AppData\Local\Programs\Ollama\ollama.exe"
)
$ollamaExe = $ollamaExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (!(Test-Path $backend) -or !(Test-Path $frontend)) {
  throw "Project folders not found. Expected healthecho-backend and healthecho-frontend under d:\HealthEcho"
}

Set-Location $backend
if (!(Test-Path ".env")) { Copy-Item .env.example .env }

if ($ollamaExe) {
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
    Write-Host "Ollama detected but model check/pull failed. Backend will use fallback if model is unavailable." -ForegroundColor Yellow
  }
} else {
  Write-Host "Ollama executable not found. AI generation may fallback to rule-based output." -ForegroundColor Yellow
}

if (!(Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating backend venv..." -ForegroundColor Yellow
  python -m venv .venv
}

if (!(Test-Path ".venv\Scripts\uvicorn.exe")) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  .\.venv\Scripts\python.exe -m pip install --upgrade pip
  .\.venv\Scripts\pip.exe install -r requirements.txt
}

if (!(Test-Path "..\vectorstore\index.faiss") -and (Get-ChildItem "..\medical_docs" -Filter *.pdf -ErrorAction SilentlyContinue)) {
  Write-Host "Building FAISS index from medical_docs..." -ForegroundColor Yellow
  .\.venv\Scripts\python.exe .\scripts\ingest.py | Out-Host
}

$backendProc = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000 --reload" -PassThru -WorkingDirectory $backend
Start-Sleep -Seconds 3

Set-Location $frontend
if (!(Test-Path ".env")) { Copy-Item .env.example .env }
if (!(Test-Path "node_modules")) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  npm install --no-audit --no-fund | Out-Host
}

$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev -- --host 127.0.0.1 --port 5173" -PassThru -WorkingDirectory $frontend
Start-Sleep -Seconds 4

$frontendOk = $false
for ($i = 0; $i -lt 8; $i++) {
  try {
    $resp = Invoke-WebRequest "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      $frontendOk = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

$health = $null
try {
  $health = Invoke-RestMethod "http://127.0.0.1:8000/health"
} catch {
  Write-Host "Backend started but /health check failed. Check backend logs in process: $($backendProc.Id)" -ForegroundColor Red
}

Write-Host "" 
Write-Host "HealthEcho is running." -ForegroundColor Green
if ($frontendOk) {
  Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
} else {
  Write-Host "Frontend failed to start on 127.0.0.1:5173. Check process: $($frontendProc.Id)" -ForegroundColor Red
}
Write-Host "Backend API: http://127.0.0.1:8000/docs" -ForegroundColor Green
if ($health) { Write-Host "Backend Health: $($health.status)" -ForegroundColor Green }
Write-Host ""
Write-Host "Process IDs -> Backend: $($backendProc.Id), Frontend: $($frontendProc.Id)" -ForegroundColor DarkGray
Write-Host "To stop: Stop-Process -Id $($backendProc.Id),$($frontendProc.Id) -Force" -ForegroundColor DarkGray

Start-Process "http://127.0.0.1:5173" | Out-Null
