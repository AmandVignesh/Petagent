# media.ps1
# Native Windows Process Window Title parser for Media Tracking
# (A hyper-fast, universally compatible alternative to WinRT GSMTC)

[CmdletBinding()]
param()

$ErrorActionPreference = "SilentlyContinue"

try {
    # Fetch all processes that have a visible window title
    $processes = Get-Process | Where-Object { -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) }

    $status = "Stopped"
    $title = ""
    $artist = ""
    $appId = ""

    foreach ($p in $processes) {
        # 1. Check for Spotify App
        if ($p.ProcessName -match "Spotify") {
            $wTitle = $p.MainWindowTitle
            # When playing, title is "Artist - Song". When paused/stopped, it's just "Spotify"
            if ($wTitle -notmatch "^Spotify") {
                $parts = $wTitle -split " - ", 2
                if ($parts.Length -eq 2) {
                    $status = "Playing"
                    $artist = $parts[0].Trim()
                    $title = $parts[1].Trim()
                    $appId = "Spotify"
                    break
                }
            }
        }
        # 2. Check for YouTube in Web Browsers
        elseif ($p.ProcessName -match "chrome|msedge|brave|firefox|opera") {
            $wTitle = $p.MainWindowTitle
            if ($wTitle -match " - YouTube") {
                $status = "Playing"
                $appId = "YouTube"
                $titleRaw = $wTitle -replace "(?i)\s*-\s*YouTube.*$", ""
                
                # Try to split "Artist - Title" if present in the YouTube video name
                $parts = $titleRaw -split " - ", 2
                if ($parts.Length -eq 2) {
                    $artist = $parts[0].Trim()
                    $title = $parts[1].Trim()
                } else {
                    $title = $titleRaw.Trim()
                    $artist = "YouTube"
                }
                break
            }
        }
    }

    $output = @{
        status = $status
        app = $appId
        title = $title
        artist = $artist
    }
    
    $json = $output | ConvertTo-Json -Compress
    Write-Output $json

} catch {
    Write-Output "{""status"": ""Error"", ""message"": ""$($_.Exception.Message)""}"
}
