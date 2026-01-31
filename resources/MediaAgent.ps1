[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"
$logFile = "C:\Users\cucun\.gemini\antigravity\scratch\win11-glass-suite\agent_debug.log"

# 1. Robust IPC Input Handler (Synchronized Queue)
$ipcQueue = [hashtable]::Synchronized(@{})
$ipcQueue.Commands = [System.Collections.Generic.Queue[string]]::new()

$inputScript = {
    param($queue)
    while ($true) {
        try {
            $line = [Console]::In.ReadLine()
            if ($null -ne $line -and $line.Trim() -ne "") {
                $cmd = $line.Trim().ToLower()
                $queue.Commands.Enqueue($cmd)
            }
        }
        catch { }
        Start-Sleep -Milliseconds 100
    }
}

# Start background input listener
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$psInput = [powershell]::Create().AddScript($inputScript).AddArgument($ipcQueue)
$psInput.Runspace = $rs
$handle = $psInput.BeginInvoke()

function Log($msg) {
    "[" + (Get-Date).ToString("HH:mm:ss") + "] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Log "--- STARTING AGENT v6 (WASAPI Volume) ---"

# 2. Native Types & WASAPI Interop
$wasapiCode = @"
using System;
using System.Runtime.InteropServices;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int _(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}
[Guid("77AA9910-1AA6-484F-8BC8-9A698B020AEE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionManager2 {
    int _(); int _2(); int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionEnumerator {
    int GetCount(out int Count); int GetSession(int SessionCount, out IAudioSessionControl Session);
}
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl2 {
    int _(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9();
    int GetProcessId(out uint RetVal);
}
[Guid("87CE5492-F588-4314-7531-56711403881C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISimpleAudioVolume {
    int GetMasterVolume(out float fLevel);
    int SetMasterVolume(float fLevel, ref Guid EventContext);
}

public class Native {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
}

public class VolumeControl {
    public static void SetAppVolume(uint pid, float change) {
        try {
            var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
            IMMDevice device;
            enumerator.GetDefaultAudioEndpoint(0, 1, out device);
            object o;
            var iid = new Guid("77AA9910-1AA6-484F-8BC8-9A698B020AEE");
            device.Activate(ref iid, 21, IntPtr.Zero, out o);
            var manager = (IAudioSessionManager2)o;
            IAudioSessionEnumerator sessionEnum;
            manager.GetSessionEnumerator(out sessionEnum);
            int count;
            sessionEnum.GetCount(out count);
            for (int i = 0; i < count; i++) {
                IAudioSessionControl session;
                sessionEnum.GetSession(i, out session);
                var session2 = (IAudioSessionControl2)session;
                uint spid;
                session2.GetProcessId(out spid);
                if (spid == pid) {
                    var volume = (ISimpleAudioVolume)session;
                    float current;
                    volume.GetMasterVolume(out current);
                    float next = current + change;
                    if (next > 1f) next = 1f;
                    if (next < 0f) next = 0f;
                    Guid g = Guid.Empty;
                    volume.SetMasterVolume(next, ref g);
                }
            }
        } catch { }
    }
}
[Guid("F4B1A092-968A-4396-8154-5A20F1E1682E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioSessionControl { }
"@
try { Add-Type -TypeDefinition $wasapiCode -Language CSharp } catch { }

# 3. WinRT Loading
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    Add-Type -AssemblyName System.Windows.Forms
    $SMType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    $PBStatus = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media, ContentType = WindowsRuntime]
}
catch { }

Function Await($WinRtOp) {
    if ($WinRtOp -eq $null) { return $null }
    try {
        $timeout = 0
        while ($WinRtOp.Status -eq "Started" -and $timeout -lt 60) { 
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 50
            $timeout++
        }
        if ($WinRtOp.Status -eq "Completed") { return $WinRtOp.GetResults() }
    }
    catch { }
    return $null
}

# 4. Global Manager
$globalManager = $null
try { $globalManager = Await ($SMType::RequestAsync()) } catch { }

# 5. Media Control Helper
function Send-MediaCmd($cmd) {
    Log "Command Executing: $cmd"
    $handled = $false
    
    # 0. Spotify-Specific Volume (DISABLED: User wants system volume)
    <#
    if ($cmd -eq "vol_up" -or $cmd -eq "vol_down") {
        $spotifyProcs = Get-Process spotify -ErrorAction SilentlyContinue
        if ($spotifyProcs) {
            $change = if ($cmd -eq "vol_up") { 0.1 } else { -0.1 }
            foreach ($p in $spotifyProcs) {
                [VolumeControl]::SetAppVolume($p.Id, $change)
            }
            Log "Spotify Volume Adjusted ($cmd)"
            $handled = $true
        }
    }

    if ($handled) { return }
    #>

    # 1. Try WinRT
    if ($globalManager) {
        try {
            $sessions = $globalManager.GetSessions()
            $s = ($sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq $PBStatus::Playing }) | Select-Object -First 1
            if (-not $s) { $s = $globalManager.GetCurrentSession() }
            if ($s) {
                switch ($cmd) {
                    "playpause" { $s.TryTogglePlayPauseAsync() | Out-Null; $handled = $true }
                    "next" { $s.TrySkipNextAsync() | Out-Null; $handled = $true }
                    "prev" { $s.TrySkipPreviousAsync() | Out-Null; $handled = $true }
                    "play" { $s.TryPlayAsync() | Out-Null; $handled = $true }
                    "pause" { $s.TryPauseAsync() | Out-Null; $handled = $true }
                }
            }
        }
        catch { }
    }
    
    # 2. Target Spotify directly via WM_APPCOMMAND (0x0319)
    if (-not $handled) {
        $spotify = Get-Process spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($spotify) {
            $hwnd = $spotify.MainWindowHandle
            $appCmd = 0
            if ($cmd -eq "playpause") { $appCmd = 14 }
            elseif ($cmd -eq "next") { $appCmd = 11 }
            elseif ($cmd -eq "prev") { $appCmd = 12 }
            elseif ($cmd -eq "play") { $appCmd = 46 }
            elseif ($cmd -eq "pause") { $appCmd = 47 }
            
            if ($appCmd -ne 0) {
                [Native]::SendMessage($hwnd, 0x0319, [IntPtr]::Zero, [IntPtr]($appCmd * 65536))
                Log "Sent AppCommand $appCmd to Spotify HWND $hwnd"
                $handled = $true
            }
        }
    }
    
    # 3. Global Fallback: Keyboard Events
    if (-not $handled) {
        Log "Global Fallback: $cmd"
        switch ($cmd) {
            "playpause" { [Native]::keybd_event(179, 0, 0, [UIntPtr]::Zero); [Native]::keybd_event(179, 0, 2, [UIntPtr]::Zero) }
            "next" { [Native]::keybd_event(176, 0, 0, [UIntPtr]::Zero); [Native]::keybd_event(176, 0, 2, [UIntPtr]::Zero) }
            "prev" { [Native]::keybd_event(177, 0, 0, [UIntPtr]::Zero); [Native]::keybd_event(177, 0, 2, [UIntPtr]::Zero) }
            "vol_up" { [Native]::keybd_event(175, 0, 0, [UIntPtr]::Zero); [Native]::keybd_event(175, 0, 2, [UIntPtr]::Zero) }
            "vol_down" { [Native]::keybd_event(174, 0, 0, [UIntPtr]::Zero); [Native]::keybd_event(174, 0, 2, [UIntPtr]::Zero) }
        }
    }
}

# 6. Helper Function for Emission
function Emit-Status {
    $title = ""; $artist = ""; $isPlaying = $false; $thumbPath = ""
    if ($globalManager) {
        try {
            [System.Windows.Forms.Application]::DoEvents()
            $sessions = $globalManager.GetSessions()
            $active = ($sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq $PBStatus::Playing }) | Select-Object -First 1
            if (-not $active) { $active = $globalManager.GetCurrentSession() }
            if ($active) {
                $pb = $active.GetPlaybackInfo()
                $isPlaying = ($pb.PlaybackStatus -eq $PBStatus::Playing)
                $props = Await ($active.TryGetMediaPropertiesAsync())
                if ($props) {
                    $title = $props.Title; $artist = $props.Artist
                    if ($props.Thumbnail) {
                        try {
                            $stream = Await ($props.Thumbnail.OpenReadAsync())
                            if ($stream -and $stream.Size -gt 0) {
                                $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
                                Await ($reader.LoadAsync($stream.Size)) | Out-Null
                                $bytes = New-Object byte[] $stream.Size
                                $reader.ReadBytes($bytes)
                                # Hash of Title+Artist for unique caching
                                $hash = [BitConverter]::ToString(([System.Security.Cryptography.MD5]::Create()).ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$title$artist"))) -replace '-'
                                $temp = "$env:TEMP\glass_$hash.jpg"
                                if (-not (Test-Path $temp)) { [System.IO.File]::WriteAllBytes($temp, $bytes) }
                                $thumbPath = $temp
                            }
                        }
                        catch {}
                    }
                }
            }
        }
        catch {}
    }

    if ($title -eq "") {
        try {
            $spotify = Get-Process spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
            if ($spotify) {
                $raw = $spotify.MainWindowTitle
                if ($raw -ne "Spotify") {
                    if ($raw -match " - ") {
                        $parts = $raw -split " - "
                        $artist = $parts[0]; $title = $parts[1] 
                    }
                    else { $title = $raw; $artist = "Spotify" }
                    $isPlaying = $true
                }
            }
        }
        catch {}
    }

    $e_title = $title.Replace("\", "\\").Replace('"', '\"')
    $e_artist = $artist.Replace("\", "\\").Replace('"', '\"')
    $e_thumb = $thumbPath.Replace("\", "\\").Replace('"', '\"')
    $json = "{ ""title"": ""$e_title"", ""artist"": ""$e_artist"", ""isPlaying"": $($isPlaying.ToString().ToLower()), ""thumbnailPath"": ""$e_thumb"" }"
    return $json
}

Write-Output '{"status": "ready"}'

# Initial Emission
Emit-Status | Write-Output

# 7. Final Robust Loop (IPC Compatible)
$lastJson = ""
while ($true) {
    try {
        # Drain the IPC queue
        while ($ipcQueue.Commands.Count -gt 0) {
            $cmd = $ipcQueue.Commands.Dequeue()
            Log "IPC Action: $cmd"
            Send-MediaCmd $cmd
        }
    }
    catch { Log "CMDLOCK: $_" }

    try {
        $json = Emit-Status
        if ($json -ne $lastJson) {
            Write-Output $json
            $lastJson = $json
        }
    }
    catch { Log "STATERR: $_" }
    
    Start-Sleep -Milliseconds 250
}
