$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param([string]$cmd)

# --- 1. KEYBOARD SIMULATION (FALLBACK) ---
$code = @"
using System;
using System.Runtime.InteropServices;
public class Keyboard {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
Add-Type -TypeDefinition $code -Language CSharp

function Press-Key($vk) {
    [Keyboard]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
    [Keyboard]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
}

# --- 2. WINRT CONTROL (ADVANCED TARGETING) ---
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    $StatusType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media, ContentType = WindowsRuntime]
    
    Function Await($WinRtOp) {
        if ($WinRtOp -eq $null) { return $null }
        $timeout = 0
        while ($WinRtOp.Status -eq "Started" -and $timeout -lt 20) { 
            Start-Sleep -Milliseconds 50
            $timeout++
        }
        if ($WinRtOp.Status -eq "Completed") { return $WinRtOp.GetResults() }
        return $null
    }

    $manager = Await ($MediaType::RequestAsync())
    
    if ($manager) {
        $sessions = $manager.GetSessions()
        $target = $null
        
        # Priority 1: Find session that is actually PLAYING/PAUSED (Active)
        foreach ($s in $sessions) {
            try {
                $info = $s.GetPlaybackInfo()
                if ($info.PlaybackStatus -eq $StatusType::Playing -or $info.PlaybackStatus -eq $StatusType::Paused) {
                    $target = $s
                    break
                }
            } catch {}
        }
        
        # Priority 2: Fallback to CurrentSession
        if (-not $target) { $target = $manager.GetCurrentSession() }
        
        if ($target) {
            # Check Capabilities
            $info = $target.GetPlaybackInfo()
            $controls = $info.Controls
            
            switch ($cmd) {
                "play" { 
                    if ($controls.IsPlayEnabled) { $target.TryPlayAsync() | Out-Null }
                    else { $target.TryTogglePlayPauseAsync() | Out-Null } 
                }
                "pause" { 
                    if ($controls.IsPauseEnabled) { $target.TryPauseAsync() | Out-Null } 
                    else { $target.TryTogglePlayPauseAsync() | Out-Null }
                }
                "playpause" { $target.TryTogglePlayPauseAsync() | Out-Null }
                "next" { if ($controls.IsNextEnabled) { $target.TrySkipNextAsync() | Out-Null } }
                "prev" { if ($controls.IsPreviousEnabled) { $target.TrySkipPreviousAsync() | Out-Null } }
            }
            exit 0
        }
    }
} catch { }

# --- 3. FALLBACK EXECUTION ---
switch ($cmd) {
    "playpause" { Press-Key 179 }
    "next"      { Press-Key 176 }
    "prev"      { Press-Key 177 }
    "vol_up"    { Press-Key 175 }
    "vol_down"  { Press-Key 174 }
    "play"      { Press-Key 179 } 
    "pause"     { Press-Key 179 } 
}
