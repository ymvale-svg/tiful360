param(
  [string]$ManifestUrl = "https://tiful360.com/agent/manifest.json"
)

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceNames = @("tiful360attendanceagent.exe", "Tiful360 Attendance Agent")

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Stop-AgentService {
  Write-Step "Stopping old service/processes"
  foreach ($name in $ServiceNames) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Stopped") {
      sc.exe stop $name | Out-Null
      Start-Sleep -Seconds 3
    }
  }

  $escapedDir = $AgentDir.Replace("\", "\\")
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -match "node" -and $_.CommandLine -match [regex]::Escape($AgentDir) } |
    ForEach-Object {
      Write-Host "Killing stale node process PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Remove-AgentService {
  Write-Step "Removing old service registration"
  foreach ($name in $ServiceNames) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc) {
      sc.exe delete $name | Out-Null
      Start-Sleep -Seconds 2
    }
  }
}

function Update-EnvFile {
  Write-Step "Updating .env safety flags"
  $envPath = Join-Path $AgentDir ".env"
  if (!(Test-Path $envPath)) {
    Write-Warning ".env was not found. Run npm run setup after this repair."
    return
  }

  $lines = Get-Content $envPath -Encoding UTF8
  $pairs = [ordered]@{
    "AUTO_UPDATE" = "true"
    "AGENT_MANIFEST_URL" = $ManifestUrl
    "CLOCK_PROTOCOL" = "auto"
    "FORCE_TCP" = "1"
  }

  foreach ($key in $pairs.Keys) {
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=") {
        $lines[$i] = "$key=$($pairs[$key])"
        $found = $true
      }
    }
    if (!$found) { $lines += "$key=$($pairs[$key])" }
  }

  Copy-Item $envPath "$envPath.bak" -Force
  Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

function Install-ManifestFiles {
  Write-Step "Downloading latest agent from manifest"
  $manifest = Invoke-RestMethod -Uri "$ManifestUrl?t=$(Get-Date -UFormat %s)"
  Write-Host "Manifest version: $($manifest.version)"

  $staging = Join-Path $AgentDir ".repair-staging"
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
  New-Item -ItemType Directory -Path $staging | Out-Null

  foreach ($file in $manifest.files) {
    $safeName = [IO.Path]::GetFileName($file.name)
    $target = Join-Path $staging $safeName
    Invoke-WebRequest -Uri "$($file.url)?t=$(Get-Date -UFormat %s)" -OutFile $target
    if ($file.sha256) {
      $hash = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
      if ($hash -ne $file.sha256.ToLowerInvariant()) {
        throw "SHA256 mismatch for $safeName"
      }
    }
    Copy-Item $target (Join-Path $AgentDir $safeName) -Force
    Write-Host "Updated $safeName"
  }

  Remove-Item $staging -Recurse -Force
}

function Install-Service {
  Write-Step "Installing dependencies and service"
  Push-Location $AgentDir
  try {
    if (!(Test-Path (Join-Path $AgentDir "node_modules"))) {
      npm install
    }
    npm run service:install
    Start-Sleep -Seconds 5
    sc.exe start "tiful360attendanceagent.exe" | Out-Null
  } finally {
    Pop-Location
  }
}

function Show-Result {
  Write-Step "Result"
  sc.exe query "tiful360attendanceagent.exe"
  $pkgPath = Join-Path $AgentDir "package.json"
  if (Test-Path $pkgPath) {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    Write-Host "Installed files version: $($pkg.version)" -ForegroundColor Green
  }
  Write-Host "Tail log:"
  $logPath = Join-Path $AgentDir "daemon\tiful360attendanceagent.out.log"
  if (Test-Path $logPath) { Get-Content $logPath -Tail 40 -Encoding UTF8 }
}

Stop-AgentService
Remove-AgentService
Install-ManifestFiles
Update-EnvFile
Install-Service
Show-Result