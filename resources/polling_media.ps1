[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms

Write-Host "Starting Polling Debug Script..."

try {
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    if (-not $MediaType) {
        Write-Error "Could not load Type"
        exit
    }

    Write-Host "Requesting SessionManager (Async)..."
    $op = $MediaType::RequestAsync()
    
    if (-not $op) {
        Write-Error "RequestAsync returned null immediately."
        exit
    }

    $timeout = 0
    while ($op.Status -eq "Started" -and $timeout -lt 20) {
        Start-Sleep -Milliseconds 200
        $timeout++
        Write-Host "." -NoNewline
    }
    Write-Host ""

    if ($op.Status -ne "Completed") {
        Write-Error "Async Operation did not complete. Status: $($op.Status)"
        
        # Try to get error info if failed
        if ($op.Status -eq "Error") {
            Write-Error "ErrorCode: $($op.ErrorCode)"
        }
        exit
    }

    $manager = $op.GetResults()
    
    if (-not $manager) {
        Write-Error "Manager is null after completion."
        exit
    }
    
    Write-Host "Manager acquired successfully."

    $session = $manager.GetCurrentSession()
    if ($session) {
        Write-Host "Current Session Found: $($session.SourceAppUserModelId)"
        $props = $session.TryGetMediaPropertiesAsync().GetResults() # Use GetResults() directly if sync enough, else poll again
        if ($props) {
            Write-Host "Title: $($props.Title)"
            Write-Host "Artist: $($props.Artist)"
        }
    }
    else {
        Write-Host "No Current Session. Listing all..."
        $sessions = $manager.GetSessions()
        Write-Host "Count: $($sessions.Count)"
        foreach ($s in $sessions) {
            Write-Host " - $($s.SourceAppUserModelId)"
        }
    }

}
catch {
    Write-Error "General Error: $_"
    $_.ScriptStackTrace
}
