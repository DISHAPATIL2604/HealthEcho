$ErrorActionPreference = "Stop"

$backendDir = "d:\HealthEcho\healthecho-backend"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"
if (!(Test-Path $python)) { throw "Backend venv not found. Run backend setup first." }

$p = Start-Process -FilePath $python -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -PassThru -WorkingDirectory $backendDir
Start-Sleep -Seconds 4

try {
  $health = Invoke-RestMethod "http://127.0.0.1:8000/health"
  $ingest = Invoke-RestMethod -Method Post "http://127.0.0.1:8000/ingest"
  $analyze = Invoke-RestMethod -Method Post "http://127.0.0.1:8000/analyze" -ContentType "application/x-www-form-urlencoded" -Body @{ manual_text = "Hemoglobin: 10.8 WBC: 7.2 RBC: 4.1 Platelets: 240 Glucose: 132 Cholesterol: 210 TSH: 4.8 Creatinine: 0.9 Vitamin D: 18 Iron: 45" }
  $chatBody = @{ question = "What should I focus on first?"; analysis_summary = $analyze; history = @(@{role="user";content="Can you summarize my report?"}, @{role="assistant";content="Risk appears moderate."}) } | ConvertTo-Json -Depth 20
  $chat = Invoke-RestMethod -Method Post "http://127.0.0.1:8000/chat" -ContentType "application/json" -Body $chatBody

  [PSCustomObject]@{
    health = $health.status
    ingest_chunks = $ingest.chunk_count
    analyze_risk = $analyze.risk_level
    analyze_conditions = ($analyze.predicted_conditions -join ", ")
    chat_preview = ($chat.answer.Substring(0, [Math]::Min(120, $chat.answer.Length)))
  } | Format-List
}
finally {
  if ($p -and !$p.HasExited) { Stop-Process -Id $p.Id -Force }
}
