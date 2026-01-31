[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"
$logFile = "C:\Users\cucun\.gemini\antigravity\scratch\win11-glass-suite\agent_debug.log"

function Log($msg) {
    "[" + (Get-Date).ToString("HF:mm:ss") + "] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Log "--- STARTING AGENT (SCRAPER) ---"

# 1. Define Native Keyboard (Fallback)
$code = @"
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
Add-Type -TypeDefinition $code -Language CSharp

# 2. Load WinRT & Forms
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    Add-Type -AssemblyName System.Windows.Forms
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    $StorageType = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
    Log "WinRT Types & Forms Loaded."
} catch {
    Log "FATAL: Could not load Types. $_"
}

# 3. Helper: Polling Await with DoEvents
Function Await($WinRtOp) {
    if ($WinRtOp -eq $null) { return $null }
    try {
        $timeout = 0
        while ($WinRtOp.Status -eq "Started" -and $timeout -lt 50) { 
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 100
            $timeout++
        }
        
        if ($WinRtOp.Status -eq "Completed") {
            return $WinRtOp.GetResults()
        }
    } catch { }
    return $null
}

# 4. Initialize Manager
$manager = $null
try {
    Log "Requesting SessionManager..."
    if ($MediaType) {
        $op = $MediaType::RequestAsync()
        $manager = Await $op
    }
} catch { Log "Manager Init Failed: $_" }

if ($manager) { Log "Manager Acquired." } else { Log "Manager NOT Acquired." }

Write-Output '{"status": "ready"}'

# 5. Main Loop
$lastJson = ""
$currentLine = ""

while ($true) {
    # --- INPUT HANDLING ---
    while ([Console]::KeyAvailable) {
        $k = [Console]::ReadKey($true)
        if ($k.Key -eq "Enter") {
            $cmd = $currentLine.Trim().ToLower()
            $currentLine = ""
            if ($cmd -eq "exit") { exit }
            
            # Try WinRT Control
            $handled = $false
            if ($manager) {
                try {
                    $s = $manager.GetCurrentSession()
                    if ($s) {
                        if ($cmd -eq "play") { $s.TryPlayAsync() | Out-Null; $handled = $true }
                        elseif ($cmd -eq "pause") { $s.TryPauseAsync() | Out-Null; $handled = $true }
                        elseif ($cmd -eq "playpause") { $s.TryTogglePlayPauseAsync() | Out-Null; $handled = $true }
                        elseif ($cmd -eq "next") { $s.TrySkipNextAsync() | Out-Null; $handled = $true }
                        elseif ($cmd -eq "prev") { $s.TrySkipPreviousAsync() | Out-Null; $handled = $true }
                    }
                } catch { }
            }

            # Fallback
            if (-not $handled) {
                if ($cmd -eq "vol_up") { [Keyboard]::keybd_event(175, 0, 0, [UIntPtr]::Zero); [Keyboard]::keybd_event(175, 0, 2, [UIntPtr]::Zero) }
                elseif ($cmd -eq "vol_down") { [Keyboard]::keybd_event(174, 0, 0, [UIntPtr]::Zero); [Keyboard]::keybd_event(174, 0, 2, [UIntPtr]::Zero) }
                elseif ($cmd -eq "next") { [Keyboard]::keybd_event(176, 0, 0, [UIntPtr]::Zero); [Keyboard]::keybd_event(176, 0, 2, [UIntPtr]::Zero) }
                elseif ($cmd -eq "prev") { [Keyboard]::keybd_event(177, 0, 0, [UIntPtr]::Zero); [Keyboard]::keybd_event(177, 0, 2, [UIntPtr]::Zero) }
                elseif ($cmd -eq "playpause") { [Keyboard]::keybd_event(179, 0, 0, [UIntPtr]::Zero); [Keyboard]::keybd_event(179, 0, 2, [UIntPtr]::Zero) }
            }
        } else {
            $currentLine += $k.KeyChar
        }
    }

    # --- STATUS UPDATE ---
    $title = ""
    $artist = ""
    $isPlaying = $false

    if ($manager) {
        try {
            [System.Windows.Forms.Application]::DoEvents()
            $sessions = $manager.GetSessions()
            $targetSession = $null
            
            # 1. Try to find a Playing session
            foreach ($s in $sessions) {
                try {
                    $pb = $s.GetPlaybackInfo()
                    if ($pb -and $pb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
                        $targetSession = $s
                        break
                    }
                } catch {}
            }
            
            # 2. Fallback to GetCurrentSession() if nothing playing
            if (-not $targetSession) { $targetSession = $manager.GetCurrentSession() }
            # 3. Fallback to First session
            if (-not $targetSession -and $sessions.Count -gt 0) { $targetSession = $sessions[0] }

            if ($targetSession) {
                $props = Await ($targetSession.TryGetMediaPropertiesAsync())
                $pb = $targetSession.GetPlaybackInfo()
                
                if ($props) {
                    $title = $props.Title
                    $artist = $props.Artist
                    
                    if ($props.Thumbnail) {
                        try {
                            $thumbOp = $props.Thumbnail.OpenReadAsync()
                            $stream = Await $thumbOp
                            
                            if ($stream) {
                                $len = $stream.Size
                                if ($len -gt 0) {
                                    $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
                                    $loadOp = $reader.LoadAsync($len)
                                    Await $loadOp | Out-Null
                                    
                                    $bytes = New-Object byte[] $len
                                    $reader.ReadBytes($bytes)
                                    
                                    $tempPath = "$env:TEMP\glass_cover.jpg"
                                    [System.IO.File]::WriteAllBytes($tempPath, $bytes)
                                    $thumbPath = $tempPath
                                    # Log "Saved Thumb: $len bytes"
                                }
                            }
                        } catch {
                            # Log "Thumb Error: $_" 
                        }
                    }
                }
                
                if ($pb) {
                    $isPlaying = ($pb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
                }
            }
        } catch {}
    }

    # --- LEGACY SCRAPING FALLBACK ---
    if ($title -eq "") {
        try {
            # Try Spotify
            $spotify = Get-Process spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
            if ($spotify) {
                $raw = $spotify.MainWindowTitle
                if ($raw -ne "Spotify" -and $raw -ne "Spotify Free" -and $raw -ne "Spotify Premium") {
                    if ($raw -match " - ") {
                        $parts = $raw -split " - "
                        $artist = $parts[0]
                        $title = $parts[1] 
                    } else {
                        $title = $raw
                        $artist = "Spotify"
                    }
                    $isPlaying = $true # Guess
                }
            }
        } catch {}
    }

    $e_title = $title.Replace("\", "\\").Replace('"', '\"')
    $e_artist = $artist.Replace("\", "\\").Replace('"', '\"')
    $e_thumb = $thumbPath.Replace("\", "\\").Replace('"', '\"')
    $s_playing = $isPlaying.ToString().ToLower()
                
    $json = "{ ""title"": ""$e_title"", ""artist"": ""$e_artist"", ""isPlaying"": $s_playing, ""thumbnailPath"": ""$e_thumb"" }"
    
    if ($json -ne $lastJson) {
        Write-Output $json
        $lastJson = $json
    }

    Start-Sleep -Milliseconds 500
}
