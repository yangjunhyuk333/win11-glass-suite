[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue" # Show errors!

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms

Write-Host "Starting Debug Script..."

try {
    $MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    if (-not $MediaType) {
        Write-Error "Could not load Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager"
        exit
    }
    Write-Host "Type Loaded."

    # Helper for Await
    $asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
    $asTaskGeneric = $asTaskMethods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1

    if (-not $asTaskGeneric) {
        Write-Error "Could not find AsTask generic method."
        exit
    }

    Function Await($WinRtTask) {
        if ($WinRtTask -eq $null) { return $null }
        $interface = $WinRtTask.GetType().GetInterfaces() | Where-Object { $_.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
        if ($interface) {
            $resultType = $interface.GetGenericArguments()[0]
            $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            try {
                $netTask.Wait(2000) | Out-Null
                return $netTask.Result
            }
            catch {
                Write-Error "Task Wait Failed: $_"
                return $null
            }
        }
        return $null
    }

    Write-Host "Requesting SessionManager..."
    $op = $MediaType::RequestAsync()
    $manager = Await $op
    
    if (-not $manager) {
        Write-Error "Manager is null."
        exit
    }
    Write-Host "Manager acquired."

    $sessions = $manager.GetSessions()
    Write-Host "Sessions count: $($sessions.Count)"

    foreach ($s in $sessions) {
        Write-Host "Session: $($s.SourceAppUserModelId)"
        try {
            $pb = $s.GetPlaybackInfo()
            Write-Host "  Status: $($pb.PlaybackStatus)"
        }
        catch {
            Write-Host "  Could not get playback info: $_"
        }
    }

}
catch {
    Write-Error "General Error: $_"
    $_.ScriptStackTrace
}
