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

# --- 2. WINRT CONTROL (PRIMARY) ---
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    
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
        # Try to find specific Spotify session first, or any playing session
        $sessions = $manager.GetSessions()
        $target = $null
        
        foreach ($s in $sessions) {
            # Check Process Name if possible (heuristic)
            if ($s.SourceAppUserModelId -match "Spotify") { $target = $s; break }
        }
        
        if (-not $target -and $sessions.Count -gt 0) { $target = $sessions[0] }
        
        if ($target) {
            switch ($cmd) {
                "play" { $target.TryPlayAsync() | Out-Null }
                "pause" { $target.TryPauseAsync() | Out-Null }
                "playpause" { $target.TryTogglePlayPauseAsync() | Out-Null }
                "next" { $target.TrySkipNextAsync() | Out-Null }
                "prev" { $target.TrySkipPreviousAsync() | Out-Null }
            }
            # Log "WinRT Command Sent"
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
