# TenderNet one-click launcher
# Usage: .\dev.ps1

$ROOT   = $PSScriptRoot
$FEED   = "$ROOT\examples\marketplace\feed"
$WEB    = "$ROOT\examples\marketplace\web"
$AGENTS = "$ROOT\coral-agents"
$PROXY  = "$AGENTS\coral-mcp-proxy.mjs"

function Wait-Port($port, $label, $secs = 30) {
  Write-Host "  Waiting for $label on :$port ..." -NoNewline
  $deadline = (Get-Date).AddSeconds($secs)
  while ((Get-Date) -lt $deadline) {
    if ($null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
      Write-Host " ready" -ForegroundColor Green; return $true
    }
    Start-Sleep -Milliseconds 800; Write-Host "." -NoNewline
  }
  Write-Host " TIMEOUT" -ForegroundColor Red; return $false
}

function Port-Open($port) {
  return $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Open-Win($title, $cmd) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
}

Write-Host ""
Write-Host "=== TenderNet Dev Launcher ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Docker ───────────────────────────────────────────────────────────────
Write-Host "[1/6] Checking Docker..." -ForegroundColor Yellow
$dockerOk = $false
try { docker info 2>&1 | Out-Null; $dockerOk = $LASTEXITCODE -eq 0 } catch {}
if (-not $dockerOk) {
  Write-Host "  Starting Docker Desktop..." -ForegroundColor DarkYellow
  $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerExe) { Start-Process $dockerExe }
  $deadline = (Get-Date).AddSeconds(60)
  Write-Host "  Waiting for Docker..." -NoNewline
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3; Write-Host "." -NoNewline
    try { docker info 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break } } catch {}
  }
  Write-Host ""
  if (-not $dockerOk) { Write-Host "ERROR: start Docker Desktop manually then re-run" -ForegroundColor Red; exit 1 }
}
Write-Host "  Docker OK" -ForegroundColor Green

# ── 2. coral-server ─────────────────────────────────────────────────────────
Write-Host "[2/6] Starting coral-server..." -ForegroundColor Yellow
if (Port-Open 5555) { Write-Host "  already running" -ForegroundColor Green }
else {
  Set-Location $ROOT
  docker compose up -d coral 2>&1 | Out-Null
  if (-not (Wait-Port 5555 "coral-server" 40)) { Write-Host "ERROR: coral-server failed" -ForegroundColor Red; exit 1 }
}

# ── 3. Feed server ───────────────────────────────────────────────────────────
Write-Host "[3/6] Starting feed server..." -ForegroundColor Yellow
if (Port-Open 4000) { Write-Host "  already running" -ForegroundColor Green }
else {
  Open-Win "TenderNet Feed" "Set-Location '$FEED'; npm start"
  if (-not (Wait-Port 4000 "feed server" 25)) { Write-Host "ERROR: feed server failed" -ForegroundColor Red; exit 1 }
}

# ── 4. Frontend ──────────────────────────────────────────────────────────────
Write-Host "[4/6] Starting frontend..." -ForegroundColor Yellow
if (Port-Open 5173) { Write-Host "  already running" -ForegroundColor Green }
else {
  Open-Win "TenderNet Web" "Set-Location '$WEB'; npm run dev"
  Wait-Port 5173 "frontend" 60 | Out-Null
}

# ── 5. Create session + write .mcp.json files ────────────────────────────────
Write-Host "[5/6] Creating TenderNet session..." -ForegroundColor Yellow
$agentList = @("buyer","whitehall-analytics","insight-research","stratford-advisory")
$SESSION = ""
try {
  $resp = Invoke-WebRequest "http://localhost:4000/api/start" -Method POST -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
  $body = $resp.Content | ConvertFrom-Json
  $SESSION = $body.session
  if (-not $SESSION) { throw $resp.Content }
  Write-Host "  Session: $SESSION" -ForegroundColor Green
} catch {
  Write-Host "  WARNING: $_ — run manually: bash coral-agents/start-session.sh" -ForegroundColor DarkYellow
}

# Parse per-agent connection URLs from Docker logs (filter by session, strip ANSI codes)
if ($SESSION) {
  Write-Host "  Waiting for startup.sh to log agent URLs..." -NoNewline
  $agentList = @("buyer","whitehall-analytics","insight-research","stratford-advisory")
  $agentUrls = @{}
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    $rawLogs = docker logs coral 2>&1
    $cleanLines = $rawLogs | ForEach-Object { $_ -replace '\x1b\[[0-9;]*m', '' }
    $sessionLines = $cleanLines | Where-Object { $_ -match $SESSION }
    foreach ($a in $agentList) {
      if (-not $agentUrls[$a]) {
        $line = $sessionLines | Where-Object { $_ -match "agent=$a" -and $_ -match "Connection URL:" } | Select-Object -First 1
        if ($line -match "Connection URL:\s*(http://localhost:5555/mcp/v1/[a-f0-9-]+/mcp)") {
          $agentUrls[$a] = $matches[1]
        }
      }
    }
    if ($agentUrls.Count -eq $agentList.Count) { break }
    Start-Sleep -Milliseconds 600; Write-Host "." -NoNewline
  }
  Write-Host ""

  $proxyPath = $PROXY -replace '\\', '/'
  $settings = '{ "permissions": { "allow": ["mcp__coral__coral_send_message", "mcp__coral__coral_list_agents", "mcp__coral__coral_wait_for_mentions", "Bash(*)", "Read(*)", "Write(*)", "Edit(*)"] }, "enabledMcpjsonServers": ["coral"], "enableAllProjectMcpServers": true }'

  foreach ($a in $agentList) {
    $coralUrl = $agentUrls[$a]
    if ($coralUrl) {
      $mcpJson = "{`n  `"mcpServers`": {`n    `"coral`": {`n      `"command`": `"node`",`n      `"args`": [`"$proxyPath`"],`n      `"env`": {`n        `"CORAL_URL`": `"$coralUrl`"`n      }`n    }`n  }`n}"
      [System.IO.File]::WriteAllText("$AGENTS\$a\.mcp.json", $mcpJson)
      New-Item -ItemType Directory -Force "$AGENTS\$a\.claude" | Out-Null
      [System.IO.File]::WriteAllText("$AGENTS\$a\.claude\settings.local.json", $settings)
      Write-Host "  [$a] $coralUrl" -ForegroundColor Green
    } else {
      Write-Host "  [$a] WARNING: URL not found in Docker logs" -ForegroundColor DarkYellow
    }
  }
  Start-Sleep -Seconds 2
}

# ── 6. Open 4 agent terminals ────────────────────────────────────────────────
Write-Host "[6/6] Opening agent terminals..." -ForegroundColor Yellow
foreach ($a in $agentList) {
  Open-Win "Agent: $a" "Set-Location '$AGENTS\$a'; Write-Host '[$a] Ready — type go to start' -ForegroundColor Cyan; claude --dangerously-skip-permissions"
  Start-Sleep -Milliseconds 600
}

# Open browser — dedicated "app mode" window (not a tab in your main browser), so each dev.ps1 run
# replaces the previous run's window instead of piling up stale tabs pointed at old/expired sessions.
$url = if ($SESSION) { "http://localhost:5173?session=$SESSION" } else { "http://localhost:5173" }
Start-Sleep -Milliseconds 1000

$pidFile = "$ROOT\.tendernet-browser.pid"
if (Test-Path $pidFile) {
  $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($oldPid) { Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue }
}

$browserExe = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles (x86)\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browserExe) {
  $proc = Start-Process $browserExe -ArgumentList "--app=$url" -PassThru
  $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
} else {
  Start-Process $url
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Green
Write-Host "  All systems go!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
if ($SESSION) {
  Write-Host "  Session : $SESSION" -ForegroundColor Cyan
  Write-Host "  Browser : $url" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  In each agent window, type: go" -ForegroundColor White
Write-Host ""
