using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace GlassSuite {
    public class MediaControl {
        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        const int VK_VOLUME_MUTE = 0xAD;
        const int VK_VOLUME_DOWN = 0xAE;
        const int VK_VOLUME_UP = 0xAF;
        const int VK_MEDIA_NEXT_TRACK = 0xB0;
        const int VK_MEDIA_PREV_TRACK = 0xB1;
        const int VK_MEDIA_STOP = 0xB2;
        const int VK_MEDIA_PLAY_PAUSE = 0xB3;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;

        public static void Main(string[] args) {
             Console.WriteLine("MediaControl Started. Waiting for commands...");
             
             while (true) {
                 try {
                     string cmd = Console.ReadLine();
                     if (string.IsNullOrEmpty(cmd)) {
                         Thread.Sleep(50);
                         continue;
                     }
                     
                     cmd = cmd.Trim().ToLower();
                     if (cmd == "exit") break;
                     
                     // Console.WriteLine("Processing: " + cmd);

                     if (cmd == "vol_up") PressKey(VK_VOLUME_UP);
                     else if (cmd == "vol_down") PressKey(VK_VOLUME_DOWN);
                     else if (cmd == "mute") PressKey(VK_VOLUME_MUTE);
                     else if (cmd == "next") PressKey(VK_MEDIA_NEXT_TRACK);
                     else if (cmd == "prev") PressKey(VK_MEDIA_PREV_TRACK);
                     else if (cmd == "playpause") PressKey(VK_MEDIA_PLAY_PAUSE);
                     else if (cmd == "stop") PressKey(VK_MEDIA_STOP);
                 } catch (Exception) {
                     // Ignore errors to keep alive
                 }
             }
        }

        static void PressKey(byte key) {
            keybd_event(key, 0, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
            keybd_event(key, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }
}
