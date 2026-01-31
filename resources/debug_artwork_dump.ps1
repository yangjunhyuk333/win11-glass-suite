[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

Write-Host "--- WINRT DIAGNOSTIC DUMP (SYNC METHOD) ---"

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    
    Write-Host "1. Requesting SessionManager (Sync)..."
    try {
        # Force synchronous wait via GetAwaiter().GetResult()
        $op = $MediaType::RequestAsync()
        $manager = $op.GetAwaiter().GetResult()
    } catch {
        Write-Host "   [ERROR] RequestAsync Failed: $_" -ForegroundColor Red
        exit
    }

    if (-not $manager) {
        Write-Host "FATAL: SessionManager is NULL." -ForegroundColor Red
        exit
    }
    Write-Host "   > Manager Acquired."

    Write-Host "2. Listing Sessions..."
    $sessions = $manager.GetSessions()
    Write-Host "   > Found $($sessions.Count) sessions."

    foreach ($s in $sessions) {
        Write-Host "   ------------------------------------------------"
        Write-Host "   [Session ID]: $($s.SourceAppUserModelId)"
        
        $info = $s.GetPlaybackInfo()
        Write-Host "   [Status]: $($info.PlaybackStatus)"

        try {
            $props = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
            
            if ($props) {
                Write-Host "   [Title]: $($props.Title)"
                Write-Host "   [Artist]: $($props.Artist)"
                
                if ($props.Thumbnail) {
                    Write-Host "   [Thumbnail Object]: DETECTED" -ForegroundColor Green
                    try {
                        $stream = $props.Thumbnail.OpenReadAsync().GetAwaiter().GetResult()
                        if ($stream) {
                            Write-Host "   [Thumbnail Stream]: Accessible ($($stream.Size) bytes)" -ForegroundColor Green
                        }
                    } catch {
                        Write-Host "   [Thumbnail Stream]: Error Opening ($_) " -ForegroundColor Red
                    }
                } else {
                    Write-Host "   [Thumbnail Object]: NULL" -ForegroundColor Red
                }
            }
        } catch {
             Write-Host "   [Properties]: Error Reading ($_) " -ForegroundColor Red
        }
    }
    Write-Host "   ------------------------------------------------"

} catch {
    Write-Host "FATAL ERROR in Script: $_" -ForegroundColor Red
}
