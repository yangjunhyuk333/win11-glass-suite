using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;
using Windows.Foundation;

namespace GlassMediaAgent
{
    class Program
    {
        static GlobalSystemMediaTransportControlsSessionManager manager;
        static GlobalSystemMediaTransportControlsSession currentSession;

        static void Main(string[] args)
        {
            MainAsync(args).GetAwaiter().GetResult();
        }

        static async Task MainAsync(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine("{\"status\": \"starting\"}");

            try
            {
                manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
                if (manager == null)
                {
                    Console.WriteLine("{\"error\": \"Manager is null\"}");
                    return;
                }

                manager.CurrentSessionChanged += Manager_CurrentSessionChanged;
                UpdateSession(manager.GetCurrentSession());

                // Command Loop
                while (true)
                {
                    string line = Console.ReadLine();
                    if (string.IsNullOrEmpty(line))
                    {
                        await Task.Delay(100);
                        continue;
                    }

                    line = line.Trim().ToLower();
                    if (line == "exit") break;

                    if (currentSession != null)
                    {
                        switch (line)
                        {
                            case "play": await currentSession.TryPlayAsync(); break;
                            case "pause": await currentSession.TryPauseAsync(); break;
                            case "playpause": await currentSession.TryTogglePlayPauseAsync(); break;
                            case "next": await currentSession.TrySkipNextAsync(); break;
                            case "prev": await currentSession.TrySkipPreviousAsync(); break;
                        }
                    }
                    else
                    {
                        // Fallback to key simulation if no session? 
                        // Actually, if no session, we can't control much.
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"error\": \"" + Escape(ex.Message) + "\"}");
            }
        }

        private static void Manager_CurrentSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args)
        {
            UpdateSession(sender.GetCurrentSession());
        }

        private static void UpdateSession(GlobalSystemMediaTransportControlsSession session)
        {
            if (currentSession != null)
            {
                currentSession.MediaPropertiesChanged -= Session_MediaPropertiesChanged;
                currentSession.PlaybackInfoChanged -= Session_PlaybackInfoChanged;
            }

            currentSession = session;

            if (currentSession != null)
            {
                currentSession.MediaPropertiesChanged += Session_MediaPropertiesChanged;
                currentSession.PlaybackInfoChanged += Session_PlaybackInfoChanged;
                ReportStatus().Wait();
            }
            else
            {
                Console.WriteLine("{\"isPlaying\": false, \"title\": \"\", \"artist\": \"\"}");
            }
        }

        private static void Session_PlaybackInfoChanged(GlobalSystemMediaTransportControlsSession sender, PlaybackInfoChangedEventArgs args)
        {
            ReportStatus().Wait();
        }

        private static void Session_MediaPropertiesChanged(GlobalSystemMediaTransportControlsSession sender, MediaPropertiesChangedEventArgs args)
        {
            ReportStatus().Wait();
        }

        static string lastJson = "";

        static async Task ReportStatus()
        {
            try
            {
                if (currentSession == null) return;

                var info = currentSession.GetPlaybackInfo();
                var props = await currentSession.TryGetMediaPropertiesAsync();

                bool isPlaying = info != null && info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                string title = props != null ? props.Title : "";
                string artist = props != null ? props.Artist : "";
                string thumbPath = "";

                if (props != null && props.Thumbnail != null)
                {
                    try
                    {
                        var stream = await props.Thumbnail.OpenReadAsync();
                        if (stream != null)
                        {
                            var reader = new DataReader(stream.GetInputStreamAt(0));
                            await reader.LoadAsync((uint)stream.Size);
                            byte[] buffer = new byte[stream.Size];
                            reader.ReadBytes(buffer);

                            string tempFile = Path.Combine(Path.GetTempPath(), "glass_thumb.jpg"); // Overwrite same file to save space? Or unique? Unique avoids lock.
                            // Better: unique name
                            // tempFile = Path.Combine(Path.GetTempPath(), "glass_" + DateTime.Now.Ticks + ".jpg"); 
                            // Actually, let's just base64 return it? 
                            // The IPC expects a path, or we can change renderer to accept base64. 
                            // The previous ps1 tried to write file.
                            // Let's write file for now.
                            
                            tempFile = Path.Combine(Path.GetTempPath(), "glass_cover.jpg");
                            File.WriteAllBytes(tempFile, buffer);
                            thumbPath = tempFile;
                        }
                    }
                    catch { }
                }

                string json = String.Format("{{\"title\": \"{0}\", \"artist\": \"{1}\", \"isPlaying\": {2}, \"thumbnailPath\": \"{3}\"}}", 
                    Escape(title), Escape(artist), isPlaying.ToString().ToLower(), Escape(thumbPath));

                // Dedup
                if (json != lastJson)
                {
                    Console.WriteLine(json);
                    lastJson = json;
                }
            }
            catch { }
        }

        static string Escape(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
