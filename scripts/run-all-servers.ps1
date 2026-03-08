$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found at '$pythonExe'. Create/activate .venv first."
}

$frontendCommand = "Set-Location '$repoRoot'; npm run dev"
$backendCommand = "Set-Location '$backendDir'; & '$pythonExe' -m uvicorn main:app --reload --port 8000"

# Start Ollama if installed and not already running
$ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
if (-not $ollamaExe) {
    # Fallback: check default install location
    $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
}
$ollamaRunning = $false
try { $ollamaRunning = [bool](Invoke-RestMethod -Uri 'http://localhost:11434' -TimeoutSec 2 -ErrorAction Stop) } catch {}
if (-not $ollamaRunning -and (Test-Path $ollamaExe)) {
    $ollamaProcess = Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -PassThru
    Write-Host "Started Ollama (PID: $($ollamaProcess.Id))"
} elseif ($ollamaRunning) {
    Write-Host 'Ollama already running on port 11434'
} else {
    Write-Host 'WARNING: Ollama not found — honeypot AI will use static fallback responses'
}

$frontendProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $frontendCommand) -WorkingDirectory $repoRoot -PassThru
$backendProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $backendCommand) -WorkingDirectory $backendDir -PassThru

Write-Host "Started frontend terminal (PID: $($frontendProcess.Id))"
Write-Host "Started backend terminal (PID: $($backendProcess.Id))"
Write-Host 'Frontend URL: http://localhost:3000'
Write-Host 'Backend URL:  http://localhost:8000'
Write-Host 'Ollama URL:   http://localhost:11434'
