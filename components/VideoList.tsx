import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SERIES } from '../constants/series';
import { getAllVideos, type RemoteVideo } from '../lib/getAllVideos';
import { videoTitle } from '../lib/videoTitle';
import ThumbnailPlaceholder from './ThumbnailPlaceholder';

export default function VideoList() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 16 * 2 - 12) / 2;
  const videos = useQuery({ queryKey: ['videos'], queryFn: getAllVideos });

  if (videos.isPending) {
    return <Text style={styles.message}>Loading videos...</Text>;
  }

  if (videos.isError) {
    return <Text style={styles.message}>Videos could not be loaded.</Text>;
  }

  const sections = SERIES.map((series) => ({
    ...series,
    videos: series.id === 'others' ? videos.data.slice(0, 2) : [],
  })).filter((series) => series.videos.length > 0);

  if (sections.length === 0) {
    return <Text style={styles.message}>No videos yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {sections.map((series) => (
        <View key={series.id} style={styles.section}>
          <View style={styles.header}>
            <Text style={styles.name}>{series.name}</Text>
            <Pressable>
              <Text style={styles.more}>View more</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {series.videos.map((video) => (
              <VideoCard key={video.key} video={video} width={cardWidth} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function VideoCard({ video, width }: { video: RemoteVideo; width: number }) {
  const [failed, setFailed] = useState(false);
  const title = videoTitle(video.fileName);
  const thumbStyle = [styles.thumb, { width, height: width * 0.72 }];

  return (
    <Pressable
      style={{ width }}
      onPress={() => router.push({ pathname: '/player', params: { videoKey: video.key } })}
    >
      <View>
        {failed || !video.thumbnailUrl ? (
          <ThumbnailPlaceholder seed={video.key} style={thumbStyle} />
        ) : (
          <Image
            source={{ uri: video.thumbnailUrl }}
            onError={() => setFailed(true)}
            style={thumbStyle}
          />
        )}
        <View style={styles.playWrap}>
          <View style={styles.play}>
            <View style={styles.playTriangle} />
          </View>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.cardTitle}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 24,
  },
  message: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#6B6B6B',
  },
  section: {
    marginBottom: 22,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  more: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C4A35A',
    textDecorationLine: 'underline',
  },
  row: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  thumb: {
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
  },
  playWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#ffffff',
  },
  cardTitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
  },
});
