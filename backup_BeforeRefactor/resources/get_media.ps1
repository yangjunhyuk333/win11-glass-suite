[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

# Load required assemblies for Extension Methods (AsTask)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms # Just in case

# Define Types
$MediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
$PlaybackStatusType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media, ContentType = WindowsRuntime]

# Helper for Await
# We need to find the AsTask extension method
$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
# Usually the first one is for IAsyncOperation<T>
$asTaskGeneric = $asTaskMethods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1

Function Await($WinRtTask) {
    if ($WinRtTask -eq $null) { return $null }
    
    # Check if it has a Result property (some IAsyncOperation directly have it?) No, need Task.
    
    # We need to know T to MakeGenericMethod.
    # $WinRtTask is IAsyncOperation<T>.
    # Get T from the interface.
    $interface = $WinRtTask.GetType().GetInterfaces() | Where-Object { $_.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    if ($interface) {
        $resultType = $interface.GetGenericArguments()[0]
        $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(2000) | Out-Null
        return $netTask.Result
    }
    return $null
}

try {
    # 1. Get Manager
    $op = $MediaType::RequestAsync()
    $manager = Await $op
    
    if (-not $manager) {
        Write-Output "{}"
        exit
    }

    # 2. Get Sessions
    $sessions = $manager.GetSessions()
    
    $bestSession = $null
    
    # 3. Find Playing Session
    foreach ($s in $sessions) {
        $pb = $s.GetPlaybackInfo()
        if ($pb -and $pb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
            $bestSession = $s
            break
        }
    }
    
    # Fallback
    if (-not $bestSession) {
        $bestSession = $manager.GetCurrentSession()
        if (-not $bestSession -and $sessions.Count -gt 0) {
            $bestSession = $sessions[0]
        }
    }
    
    if (-not $bestSession) {
        Write-Output "{}"
        exit
    }
    
    # 4. Get Properties
    $opProps = $bestSession.TryGetMediaPropertiesAsync()
    $props = Await $opProps
    
    if (-not $props) {
        Write-Output "{}"
        exit
    }
    
    $title = $props.Title
    if (-not $title) { $title = "Unknown" }
    $artist = $props.Artist
    if (-not $artist) { $artist = "Unknown" }
    
    # 5. Thumbnail
    $thumbPath = ""
    if ($props.Thumbnail) {
        try {
            $opStream = $props.Thumbnail.OpenReadAsync()
            
            # OpenReadAsync returns IRandomAccessStreamWithContentType which implements IRandomAccessStream
            # Await needs to handle this. IRandomAccessStream is not generic?
            # Wait, OpenReadAsync returns IAsyncOperation<IRandomAccessStreamWithContentType>
            
            $stream = Await $opStream
            
            if ($stream) {
                $size = $stream.Size
                if ($size -gt 0) {
                    # Read bytes
                    $reader = [Windows.Storage.Streams.DataReader]::new($stream)
                    $opLoad = $reader.LoadAsync([uint32]$size)
                     
                    # DataReaderLoadOperation is also IAsyncOperation<uint>
                    $count = Await $opLoad
                     
                    if ($count -gt 0) {
                        $bytes = New-Object byte[] $count
                        $reader.ReadBytes($bytes)
                         
                        $tmpName = "glass_thumb_" + [DateTime]::Now.Ticks + ".jpg"
                        $tempPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), $tmpName)
                        [System.IO.File]::WriteAllBytes($tempPath, $bytes)
                        $thumbPath = $tempPath
                    }
                }
            }
        }
        catch {}
    }
    
    # 6. Playback Info again
    $finalPb = $bestSession.GetPlaybackInfo()
    $isPlaying = ($finalPb -and $finalPb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
    
    # Escape
    function Escape($s) {
        if (-not $s) { return "" }
        return $s.Replace("\", "\\").Replace('"', '\"')
    }
    
    $json = "{{ ""title"": ""{0}"", ""artist"": ""{1}"", ""isPlaying"": {2}, ""thumbnailPath"": ""{3}"" }}" -f (Escape $title), (Escape $artist), ($isPlaying.ToString().ToLower()), (Escape $thumbPath)
    Write-Output $json

}
catch {
    Write-Output "{}"
}
