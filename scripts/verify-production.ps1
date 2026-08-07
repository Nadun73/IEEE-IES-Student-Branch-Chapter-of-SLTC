param(
    [int]$Port = 4173,
    [int]$BrowserTimeoutSeconds = 40
)

$ErrorActionPreference = 'Stop'

$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vitePath = 'node_modules\vite\bin\vite.js'
$checkerPath = 'scripts\cdp-browser-check.mjs'
$nodePath = (Get-Command node.exe).Source
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$verificationRoot = Join-Path $env:TEMP ("ies-production-verification-" + [System.Diagnostics.Process]::GetCurrentProcess().Id)
$serverOutputPath = Join-Path $verificationRoot 'preview.log'
$serverErrorPath = Join-Path $verificationRoot 'preview-error.log'
$browserOutputPath = Join-Path $verificationRoot 'browser-check.log'
$browserErrorPath = Join-Path $verificationRoot 'browser-check-error.log'
$chromeErrorPath = Join-Path $verificationRoot 'chrome-error.log'
$browserProfilePath = Join-Path $verificationRoot 'chrome-profile'
$reportPath = Join-Path $verificationRoot 'cdp-report.json'
$siteUrl = "http://127.0.0.1:$Port"

New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null

$previewProcess = $null
$chromeProcess = $null
$checkerProcess = $null

try {
    $previewProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList @($vitePath, 'preview', '--host', '127.0.0.1', '--port', $Port, '--strictPort') `
        -WorkingDirectory $workspacePath `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverOutputPath `
        -RedirectStandardError $serverErrorPath `
        -PassThru

    $serverReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
        if ($previewProcess.HasExited) {
            break
        }

        $tcpClient = New-Object System.Net.Sockets.TcpClient
        try {
            $connectionTask = $tcpClient.ConnectAsync('127.0.0.1', $Port)
            if ($connectionTask.Wait(250) -and $tcpClient.Connected) {
                $serverReady = $true
                break
            }
        }
        catch {
            # The preview process is still starting.
        }
        finally {
            $tcpClient.Dispose()
        }

        Start-Sleep -Milliseconds 100
    }

    if (-not $serverReady) {
        $previewError = Get-Content -Raw -LiteralPath $serverErrorPath -ErrorAction SilentlyContinue
        throw "The production preview did not become ready within five seconds. $previewError"
    }

    $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ne 200) {
        throw "The production preview returned HTTP $($response.StatusCode)."
    }

    $mastermindsResponse = Invoke-WebRequest `
        -Uri "$siteUrl/masterminds/" `
        -UseBasicParsing `
        -TimeoutSec 5
    if ($mastermindsResponse.StatusCode -ne 200) {
        throw "The Masterminds page returned HTTP $($mastermindsResponse.StatusCode)."
    }

    $debugListener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        0
    )
    $debugListener.Start()
    $debugPort = $debugListener.LocalEndpoint.Port
    $debugListener.Stop()

    $chromeArguments = @(
        '--headless=new',
        '--disable-gpu',
        '--disable-gpu-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--no-sandbox',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        "--remote-debugging-port=$debugPort",
        "--user-data-dir=$browserProfilePath",
        'about:blank'
    )

    $chromeProcess = Start-Process `
        -FilePath $chromePath `
        -ArgumentList $chromeArguments `
        -WindowStyle Hidden `
        -RedirectStandardError $chromeErrorPath `
        -PassThru

    $debugReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
        if ($chromeProcess.HasExited) {
            break
        }

        try {
            $debugResponse = Invoke-WebRequest `
                -Uri "http://127.0.0.1:$debugPort/json/version" `
                -UseBasicParsing `
                -TimeoutSec 1
            if ($debugResponse.StatusCode -eq 200) {
                $debugReady = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 100
        }
    }

    if (-not $debugReady) {
        $chromeError = Get-Content -Raw -LiteralPath $chromeErrorPath -ErrorAction SilentlyContinue
        throw "Chrome DevTools did not become ready within five seconds. $chromeError"
    }

    $checkerProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList @($checkerPath, $debugPort, $siteUrl, $verificationRoot) `
        -WorkingDirectory $workspacePath `
        -WindowStyle Hidden `
        -RedirectStandardOutput $browserOutputPath `
        -RedirectStandardError $browserErrorPath `
        -PassThru

    $checkerFinished = $checkerProcess.WaitForExit($BrowserTimeoutSeconds * 1000)
    if (-not $checkerFinished) {
        Stop-Process -Id $checkerProcess.Id -Force -ErrorAction SilentlyContinue
        $checkerProcess.WaitForExit(3000) | Out-Null
        throw "Browser checks exceeded the $BrowserTimeoutSeconds second timeout."
    }

    $checkerOutput = Get-Content -Raw -LiteralPath $browserOutputPath -ErrorAction SilentlyContinue
    $checkerError = Get-Content -Raw -LiteralPath $browserErrorPath -ErrorAction SilentlyContinue

    if ($checkerOutput -notmatch 'CDP_VERIFICATION=PASS') {
        throw "Browser checks failed. $checkerOutput $checkerError"
    }

    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw 'The browser verification report was not created.'
    }

    $report = Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
    if (-not $report.pass) {
        throw "The browser report contains failures: $($report.failures -join ' ')"
    }

    Write-Output 'VERIFICATION=PASS'
    Write-Output "URL=$siteUrl"
    Write-Output "LOADER_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'loader-desktop-cdp.png')"
    Write-Output "LOADER_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'loader-mobile-cdp.png')"
    Write-Output "DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'desktop-cdp.png')"
    Write-Output "MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'mobile-cdp.png')"
    Write-Output "HERO_VISUAL_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'hero-visual-desktop-cdp.png')"
    Write-Output "HERO_VISUAL_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'hero-visual-mobile-cdp.png')"
    Write-Output "MOBILE_MENU_SCREENSHOT=$(Join-Path $verificationRoot 'mobile-menu-cdp.png')"
    Write-Output "ABOUT_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'about-desktop-cdp.png')"
    Write-Output "ABOUT_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'about-mobile-cdp.png')"
    Write-Output "VALUES_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'values-desktop-cdp.png')"
    Write-Output "VALUES_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'values-mobile-cdp.png')"
    Write-Output "FOCUS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'focus-desktop-cdp.png')"
    Write-Output "FOCUS_MOBILE_CARD_SCREENSHOT=$(Join-Path $verificationRoot 'focus-card-mobile-cdp.png')"
    Write-Output "MASTERMINDS_PREVIEW_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-preview-desktop-cdp.png')"
    Write-Output "MASTERMINDS_PREVIEW_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-preview-mobile-cdp.png')"
    Write-Output "MASTERMINDS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-desktop-cdp.png')"
    Write-Output "MASTERMINDS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-mobile-cdp.png')"
    Write-Output "ADVISORY_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'advisory-desktop-cdp.png')"
    Write-Output "ADVISORY_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'advisory-mobile-cdp.png')"
    Write-Output "REPORT=$reportPath"
    Write-Output $checkerOutput.Trim()
}
finally {
    if ($checkerProcess -and -not $checkerProcess.HasExited) {
        Stop-Process -Id $checkerProcess.Id -Force -ErrorAction SilentlyContinue
    }

    if ($chromeProcess -and -not $chromeProcess.HasExited) {
        Stop-Process -Id $chromeProcess.Id -Force -ErrorAction SilentlyContinue
        $chromeProcess.WaitForExit(3000) | Out-Null
    }

    if ($previewProcess -and -not $previewProcess.HasExited) {
        Stop-Process -Id $previewProcess.Id -Force -ErrorAction SilentlyContinue
        $previewProcess.WaitForExit(3000) | Out-Null
    }
}
