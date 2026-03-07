$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = Join-Path $repoRoot 'backend'
$pythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found at '$pythonExe'. Create/activate .venv first."
}

$frontendCommand = "Set-Location '$repoRoot'; npm run dev"
$backendCommand = "Set-Location '$backendDir'; & '$pythonExe' -m uvicorn main:app --reload --port 8000"

$frontendProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $frontendCommand) -WorkingDirectory $repoRoot -PassThru
$backendProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $backendCommand) -WorkingDirectory $backendDir -PassThru

Write-Host "Started frontend terminal (PID: $($frontendProcess.Id))"
Write-Host "Started backend terminal (PID: $($backendProcess.Id))"
Write-Host 'Frontend URL: http://localhost:3000'
Write-Host 'Backend URL:  http://localhost:8000'
