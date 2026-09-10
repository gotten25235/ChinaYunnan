@echo off
setlocal
cd /d "%~dp0"
set "BAT_SELF=%~f0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" set "POWERSHELL_EXE=powershell.exe"

echo Starting Yunnan local website...
echo The browser will open automatically.
echo Keep this window open while using the website.
echo Press Ctrl+C or close this window to stop the server.
echo.

"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$lines=Get-Content -LiteralPath $env:BAT_SELF; $marker=[string][char]58+'__POWERSHELL__'; $i=[Array]::IndexOf($lines,$marker); if($i -lt 0){Write-Error 'Embedded PowerShell section not found.'; exit 1}; $code=$lines[($i+1)..($lines.Length-1)] -join [Environment]::NewLine; & ([scriptblock]::Create($code))"
if errorlevel 1 goto failed
endlocal
exit /b 0

:failed
echo.
echo Startup failed.
echo Make sure Windows PowerShell is enabled and no security software is blocking localhost.
pause
endlocal
exit /b 1

:__POWERSHELL__
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $env:BAT_SELF
$preferredPort = 8765
$listener = $null
$port = $null

foreach ($candidatePort in $preferredPort..($preferredPort + 20)) {
    try {
        $tryListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
        $tryListener.Start()
        $listener = $tryListener
        $port = $candidatePort
        break
    }
    catch {
        if ($tryListener) {
            try { $tryListener.Stop() } catch {}
        }
    }
}

if (-not $listener) {
    throw 'Could not find a free localhost port between 8765 and 8785.'
}

function Get-MimeType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8'; break }
        '.htm'  { 'text/html; charset=utf-8'; break }
        '.css'  { 'text/css; charset=utf-8'; break }
        '.js'   { 'application/javascript; charset=utf-8'; break }
        '.json' { 'application/json; charset=utf-8'; break }
        '.webmanifest' { 'application/manifest+json; charset=utf-8'; break }
        '.txt'  { 'text/plain; charset=utf-8'; break }
        '.md'   { 'text/markdown; charset=utf-8'; break }
        '.svg'  { 'image/svg+xml'; break }
        '.png'  { 'image/png'; break }
        '.jpg'  { 'image/jpeg'; break }
        '.jpeg' { 'image/jpeg'; break }
        '.gif'  { 'image/gif'; break }
        '.webp' { 'image/webp'; break }
        '.ico'  { 'image/x-icon'; break }
        '.woff' { 'font/woff'; break }
        '.woff2'{ 'font/woff2'; break }
        '.ttf'  { 'font/ttf'; break }
        '.map'  { 'application/json; charset=utf-8'; break }
        default { 'application/octet-stream' }
    }
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$Reason,
        [string]$ContentType,
        [byte[]]$Body,
        [long]$ContentLength = -1,
        [bool]$SendBody = $true,
        [string]$CacheControl = 'no-cache'
    )

    if ($ContentLength -lt 0) { $ContentLength = $Body.Length }
    $header = "HTTP/1.1 $StatusCode $Reason`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $ContentLength`r`n" +
              "Cache-Control: $CacheControl`r`n" +
              "Connection: close`r`n`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($SendBody -and $Body -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

$url = "http://127.0.0.1:$port/"
Write-Host "Website folder: $root"
Write-Host "Local address:  $url"
Write-Host 'Opening browser...'
Write-Host ''
Write-Host 'PWA / Service Worker works on this localhost address.'
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
Write-Host ''

Start-Process $url

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $reader = $null
        $stream = $null

        try {
            $client.ReceiveTimeout = 10000
            $client.SendTimeout = 10000
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new(
                $stream,
                [System.Text.Encoding]::ASCII,
                $false,
                8192,
                $true
            )

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            do {
                $headerLine = $reader.ReadLine()
            } while ($null -ne $headerLine -and $headerLine -ne '')

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('400 Bad Request')
                Send-Response $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body
                continue
            }

            $method = $parts[0].ToUpperInvariant()
            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('405 Method Not Allowed')
                Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body
                continue
            }

            $requestTarget = $parts[1]
            $rawPath = ($requestTarget -split '\?', 2)[0]
            $decodedPath = [System.Uri]::UnescapeDataString($rawPath)
            $relativePath = $decodedPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }

            $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $rootFull = [System.IO.Path]::GetFullPath($root + [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

            if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('403 Forbidden')
                Send-Response $stream 403 'Forbidden' 'text/plain; charset=utf-8' $body
                continue
            }

            if (Test-Path -LiteralPath $fullPath -PathType Container) {
                $fullPath = Join-Path $fullPath 'index.html'
            }

            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
                Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $body
                continue
            }

            $fileBytes = [System.IO.File]::ReadAllBytes($fullPath)
            $mime = Get-MimeType $fullPath
            $sendBody = ($method -eq 'GET')
            $cacheControl = if ($mime.StartsWith('image/')) { 'public, max-age=31536000, immutable' } else { 'no-cache' }
            Send-Response $stream 200 'OK' $mime $fileBytes $fileBytes.LongLength $sendBody $cacheControl
        }
        catch {
            if ($stream) {
                try {
                    $body = [System.Text.Encoding]::UTF8.GetBytes('500 Internal Server Error')
                    Send-Response $stream 500 'Internal Server Error' 'text/plain; charset=utf-8' $body
                } catch {}
            }
        }
        finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            if ($client) { $client.Close() }
        }
    }
}
finally {
    if ($listener) { $listener.Stop() }
}
