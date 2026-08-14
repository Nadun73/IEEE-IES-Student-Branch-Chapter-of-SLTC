param(
    [int]$Port = 4173,
    [int]$BrowserTimeoutSeconds = 100
)

$ErrorActionPreference = 'Stop'

$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vitePath = 'node_modules\vite\bin\vite.js'
$checkerPath = 'scripts\cdp-browser-check.mjs'
$nodePath = (Get-Command node.exe).Source
$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$verificationRunId = "{0}-{1}" -f [System.Diagnostics.Process]::GetCurrentProcess().Id, ([guid]::NewGuid().ToString('N').Substring(0, 8))
$verificationRoot = Join-Path $env:TEMP ("ies-production-verification-" + $verificationRunId)
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

    $chapterResponse = Invoke-WebRequest `
        -Uri "$siteUrl/chapter/" `
        -UseBasicParsing `
        -TimeoutSec 5
    if ($chapterResponse.StatusCode -ne 200) {
        throw "The chapter page returned HTTP $($chapterResponse.StatusCode)."
    }

    $volunteerResponse = Invoke-WebRequest `
        -Uri "$siteUrl/volunteer/" `
        -UseBasicParsing `
        -TimeoutSec 5
    if ($volunteerResponse.StatusCode -ne 200) {
        throw "The volunteer page returned HTTP $($volunteerResponse.StatusCode)."
    }

    $albumsResponse = Invoke-WebRequest `
        -Uri "$siteUrl/albums/" `
        -UseBasicParsing `
        -TimeoutSec 5
    if ($albumsResponse.StatusCode -ne 200) {
        throw "The photo albums page returned HTTP $($albumsResponse.StatusCode)."
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
    Write-Output "HERO_COMPOSITION_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'hero-composition-desktop-cdp.png')"
    Write-Output "HERO_COMPOSITION_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'hero-composition-mobile-cdp.png')"
    Write-Output "MOBILE_MENU_SCREENSHOT=$(Join-Path $verificationRoot 'mobile-menu-cdp.png')"
    Write-Output "COMPACT_HEADER_SCREENSHOT=$(Join-Path $verificationRoot 'header-compact-cdp.png')"
    Write-Output "ABOUT_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'about-desktop-cdp.png')"
    Write-Output "ABOUT_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'about-mobile-cdp.png')"
    Write-Output "VALUES_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'values-desktop-cdp.png')"
    Write-Output "VALUES_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'values-mobile-cdp.png')"
    Write-Output "FLAGSHIP_EVENTS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'flagship-events-desktop-cdp.png')"
    Write-Output "FLAGSHIP_EVENTS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'flagship-events-mobile-cdp.png')"
    Write-Output "ACTIVITIES_VOLUNTEER_TRANSITION_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'activities-volunteer-transition-desktop-cdp.png')"
    Write-Output "ACTIVITIES_VOLUNTEER_TRANSITION_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'activities-volunteer-transition-mobile-cdp.png')"
    Write-Output "VOLUNTEER_SECTION_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-section-desktop-cdp.png')"
    Write-Output "VOLUNTEER_SECTION_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-section-mobile-cdp.png')"
    Write-Output "ALBUMS_PREVIEW_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'albums-preview-desktop-cdp.png')"
    Write-Output "ALBUMS_PREVIEW_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'albums-preview-mobile-cdp.png')"
    Write-Output "ALBUMS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'albums-desktop-cdp.png')"
    Write-Output "ALBUMS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'albums-mobile-cdp.png')"
    Write-Output "ALBUMS_HERO_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'albums-hero-desktop-cdp.png')"
    Write-Output "ALBUMS_HERO_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'albums-hero-mobile-cdp.png')"
    Write-Output "ALBUMS_GRID_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'albums-grid-desktop-cdp.png')"
    Write-Output "ALBUMS_GRID_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'albums-grid-mobile-cdp.png')"
    Write-Output "CONTACT_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'contact-desktop-cdp.png')"
    Write-Output "CONTACT_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'contact-mobile-cdp.png')"
    Write-Output "CONTACT_FORM_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'contact-form-desktop-cdp.png')"
    Write-Output "CONTACT_FORM_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'contact-form-mobile-cdp.png')"
    Write-Output "MASTERMINDS_PREVIEW_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-preview-desktop-cdp.png')"
    Write-Output "MASTERMINDS_PREVIEW_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-preview-mobile-cdp.png')"
    Write-Output "MASTERMINDS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-desktop-cdp.png')"
    Write-Output "MASTERMINDS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'masterminds-mobile-cdp.png')"
    Write-Output "CHAPTER_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-desktop-cdp.png')"
    Write-Output "CHAPTER_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-mobile-cdp.png')"
    Write-Output "VOLUNTEER_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-desktop-cdp.png')"
    Write-Output "VOLUNTEER_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-mobile-cdp.png')"
    Write-Output "VOLUNTEER_FORM_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-form-desktop-cdp.png')"
    Write-Output "VOLUNTEER_FORM_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-form-mobile-cdp.png')"
    Write-Output "VOLUNTEER_SELECT_OPEN_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-select-open-desktop-cdp.png')"
    Write-Output "VOLUNTEER_SELECT_OPEN_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'volunteer-select-open-mobile-cdp.png')"
    Write-Output "CHAPTER_LAYERS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-layers-desktop-cdp.png')"
    Write-Output "CHAPTER_PURPOSE_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-purpose-desktop-cdp.png')"
    Write-Output "CHAPTER_FOCUS_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-focus-desktop-cdp.png')"
    Write-Output "CHAPTER_EXPERIENCE_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-experience-desktop-cdp.png')"
    Write-Output "CHAPTER_CTA_DESKTOP_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-cta-desktop-cdp.png')"
    Write-Output "CHAPTER_LAYERS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-layers-mobile-cdp.png')"
    Write-Output "CHAPTER_PURPOSE_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-purpose-mobile-cdp.png')"
    Write-Output "CHAPTER_FOCUS_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-focus-mobile-cdp.png')"
    Write-Output "CHAPTER_EXPERIENCE_MOBILE_SCREENSHOT=$(Join-Path $verificationRoot 'chapter-experience-mobile-cdp.png')"
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
