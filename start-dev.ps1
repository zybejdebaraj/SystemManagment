param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$terminalHost = Join-Path $env:SystemRoot 'System32\cmd.exe'

function Get-DevPort([string]$Folder, [string]$Variable, [int]$Default) {
    $value = [Environment]::GetEnvironmentVariable($Variable, 'Process')
    if (-not $value) {
        foreach ($name in @('.env.local', '.env')) {
            $file = Join-Path $Folder $name
            if (Test-Path -LiteralPath $file) {
                $match = Get-Content -LiteralPath $file | Select-String -Pattern ('^\s*' + $Variable + '\s*=\s*["'']?(\d+)') | Select-Object -First 1
                if ($match) { $value = $match.Matches[0].Groups[1].Value; break }
            }
        }
    }
    if (-not $value) { return $Default }
    $number = 0
    if (-not [int]::TryParse($value, [ref]$number) -or $number -lt 1 -or $number -gt 65535) {
        throw "$Variable must be a port between 1 and 65535."
    }
    return $number
}

function Test-DevPort([int]$Port) {
    $connection = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $connection.ConnectAsync('127.0.0.1', $Port)
        return ($pending.Wait(1000) -and $connection.Connected)
    } catch { return $false }
    finally { $connection.Dispose() }
}

$serverFolder = Join-Path $PSScriptRoot 'server'
$clientFolder = Join-Path $PSScriptRoot 'client'
$serverPort = Get-DevPort $serverFolder 'PORT' 3002
$clientPort = Get-DevPort $clientFolder 'CLIENT_PORT' 5173
if ($serverPort -eq $clientPort) { throw 'Client and server must use different ports.' }

foreach ($entry in @(
    @{ Name = 'Server'; Folder = $serverFolder; Port = $serverPort },
    @{ Name = 'Client'; Folder = $clientFolder; Port = $clientPort }
)) {
    $script = Join-Path $entry.Folder 'scripts\terminal.cmd'
    if (-not (Test-Path -LiteralPath $script)) { throw "Missing terminal script: $script" }
    if (Test-DevPort $entry.Port) {
        Write-Host "$($entry.Name) port $($entry.Port) is already in use. Keeping the existing process; no duplicate started."
    } elseif ($CheckOnly) {
        Write-Host "$($entry.Name): ready to open its own terminal on port $($entry.Port)."
    } else {
        $arguments = @('/D', '/K', ('""{0}""' -f $script))
        Start-Process -FilePath $terminalHost -ArgumentList $arguments -WorkingDirectory $entry.Folder -WindowStyle Normal
        Write-Host "Opened a separate $($entry.Name.ToLower()) terminal (port $($entry.Port))."
    }
}
Write-Host "Open the client at http://localhost:$clientPort"
