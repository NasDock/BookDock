import TrackPlayer, { Event, State } from 'react-native-track-player';

export const PlaybackService = async function () {
  console.log('[PlaybackService] Registered');

  const ensurePlaying = async () => {
    const playback = await TrackPlayer.getPlaybackState();
    if (playback.state !== State.Playing) {
      await TrackPlayer.play();
    }
  };

  const ensurePaused = async () => {
    const playback = await TrackPlayer.getPlaybackState();
    if (playback.state !== State.Paused) {
      await TrackPlayer.pause();
    }
  };

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[PlaybackService] RemotePlay');
    await ensurePlaying();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[PlaybackService] RemotePause');
    await ensurePaused();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[PlaybackService] RemoteStop');
    await TrackPlayer.reset();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    console.log('[PlaybackService] RemoteSeek:', event.position);
    await TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    console.log('[PlaybackService] RemoteJumpForward:', event.interval);
    await TrackPlayer.seekBy(event.interval || 15);
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    console.log('[PlaybackService] RemoteJumpBackward:', event.interval);
    await TrackPlayer.seekBy(-(event.interval || 15));
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    console.log('[PlaybackService] RemoteNext');
    await TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    console.log('[PlaybackService] RemotePrevious');
    await TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[PlaybackService] Queue ended');
  });
};
