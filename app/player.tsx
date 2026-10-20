import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllVideos, type RemoteVideo } from '../lib/getAllVideos';
import { videoTitle } from '../lib/videoTitle';
import ThumbnailPlaceholder from '../components/ThumbnailPlaceholder';

// Full screen, swipe up / down player (like TikTok / Reels).
// The video that was tapped on the home screen opens first.
export default function PlayerScreen() {
  const { videoKey } = useLocalSearchParams<{ videoKey?: string }>();
  const insets = useSafeAreaInsets();
  const videos = useQuery({ queryKey: ['videos'], queryFn: getAllVideos });
  // Every page must be exactly as tall as the screen area, so we measure it.
  const [height, setHeight] = useState(0);

  let content = null;
  if (videos.isPending) {
    content = <ActivityIndicator color="#ffffff" style={styles.center} />;
  } else if (videos.isError) {
    content = <Text style={[styles.message, styles.center]}>Videos could not be loaded.</Text>;
  } else if (videos.data.length === 0) {
    content = <Text style={[styles.message, styles.center]}>No videos yet.</Text>;
  } else if (height > 0) {
    const startIndex = Math.max(
      0,
      videos.data.findIndex((video) => video.key === videoKey),
    );
    content = <Feed videos={videos.data} startIndex={startIndex} height={height} />;
  }

  return (
    <View style={styles.screen} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {content}
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={[styles.back, { top: insets.top + 8 }]}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>
    </View>
  );
}

function Feed({
  videos,
  startIndex,
  height,
}: {
  videos: RemoteVideo[];
  startIndex: number;
  height: number;
}) {
  // Keep the list as it was when the screen opened, so a background refresh
  // can not move the current video to a different position.
  const [items] = useState(videos);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  return (
    <FlatList
      data={items}
      keyExtractor={(video) => video.key}
      renderItem={({ item, index }) => (
        <Reel video={item} height={height} active={index === activeIndex} />
      )}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      initialScrollIndex={startIndex}
      // One swipe = one video
      snapToInterval={height}
      snapToAlignment="start"
      disableIntervalMomentum
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={(event) =>
        setActiveIndex(Math.round(event.nativeEvent.contentOffset.y / height))
      }
      // Only the current video and its neighbours are kept in memory
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={1}
    />
  );
}

function Reel({
  video,
  height,
  active,
}: {
  video: RemoteVideo;
  height: number;
  active: boolean;
}) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(video.url, (reel) => {
    reel.loop = true;
    reel.timeUpdateEventInterval = 0.25;
  });
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const time = useEvent(player, 'timeUpdate', null);
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  // Play only the video that is on screen. When the user swipes away,
  // stop it and rewind, so it starts from the beginning next time.
  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
      setPaused(false);
    }
  }, [active, player]);

  function togglePlay() {
    if (player.playing) {
      player.pause();
      setPaused(true);
    } else {
      player.play();
      setPaused(false);
    }
  }

  // Vertical videos fill the screen. Wide videos are shown fully (black bars).
  const size = videoTrack?.size;
  const isVertical = size ? size.height >= size.width : false;
  const progress = time && player.duration > 0 ? Math.min(1, time.currentTime / player.duration) : 0;
  const title = videoTitle(video.fileName);

  return (
    <View style={{ height }}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit={isVertical ? 'cover' : 'contain'}
        nativeControls={false}
        // Needed so the video scrolls smoothly inside a list on Android
        surfaceType="textureView"
      />

      {/* Picture shown until the video really starts, so the screen is never black */}
      {!started ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {video.thumbnailUrl ? (
            <Image
              source={{ uri: video.thumbnailUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <ThumbnailPlaceholder seed={video.key} style={StyleSheet.absoluteFill} />
          )}
        </View>
      ) : null}

      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay} />

      {active && status === 'loading' ? (
        <ActivityIndicator color="#ffffff" style={styles.center} pointerEvents="none" />
      ) : null}

      {status === 'error' ? (
        <Text style={[styles.message, styles.center]} pointerEvents="none">
          This video could not be played.
        </Text>
      ) : null}

      {active && paused ? (
        <View style={styles.center} pointerEvents="none">
          <View style={styles.playCircle}>
            <View style={styles.playTriangle} />
          </View>
        </View>
      ) : null}

      {/* Soft dark layer at the bottom so white text and icons stay readable */}
      <View style={styles.shade} pointerEvents="none">
        <View style={[styles.shadeLayer, { height: 300 }]} />
        <View style={[styles.shadeLayer, { height: 220 }]} />
        <View style={[styles.shadeLayer, { height: 140 }]} />
        <View style={[styles.shadeLayer, { height: 70 }]} />
      </View>

      {/* Buttons on the right side. Only "Like" works for now (turns red, not saved anywhere). */}
      <View style={[styles.actions, { bottom: insets.bottom + 40 }]}>
        <Pressable style={styles.action} onPress={() => setLiked((value) => !value)} hitSlop={8}>
          <Text style={styles.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionLabel}>Like</Text>
        </Pressable>
        <View style={styles.action}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>Comment</Text>
        </View>
        <View style={styles.action}>
          <Text style={styles.actionIcon}>🔖</Text>
          <Text style={styles.actionLabel}>Save</Text>
        </View>
        <View style={styles.action}>
          <Text style={styles.actionIcon}>↪️</Text>
          <Text style={styles.actionLabel}>Share</Text>
        </View>
      </View>

      <View style={[styles.info, { paddingBottom: insets.bottom + 20 }]} pointerEvents="none">
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <View style={[styles.track, { bottom: insets.bottom }]} pointerEvents="none">
        <View style={[styles.bar, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  message: {
    color: '#ffffff',
    fontSize: 15,
  },
  back: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 34,
    marginTop: -2,
    marginRight: 2,
  },
  playCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 6,
    borderTopWidth: 13,
    borderBottomWidth: 13,
    borderLeftWidth: 22,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#ffffff',
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  // Four layers on top of each other: the darkest part is at the very bottom
  shadeLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  actions: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 20,
  },
  action: {
    alignItems: 'center',
    gap: 4,
  },
  // Emoji are plain text, so there is no icon font to wait for
  actionIcon: {
    fontSize: 32,
    lineHeight: 40,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    // keep the title away from the buttons on the right
    paddingRight: 76,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  bar: {
    height: 3,
    backgroundColor: '#ffffff',
  },
});
