import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEvent } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_SERIES_ID, SERIES } from '../constants/series';
import { getSelectedVideo } from '../lib/selectedVideo';
import { uploadVideo } from '../lib/uploadVideo';
import { uploadFileName } from '../lib/videoTitle';

export default function VideoDetailsScreen() {
  const selected = getSelectedVideo();
  const uri = selected?.uri || '';
  const thumb = selected?.thumb || '';
  const videoName = selected?.videoName || 'video.mp4';
  const contentType = selected?.contentType || 'video/mp4';
  const [title, setTitle] = useState('');
  const [seriesId, setSeriesId] = useState(DEFAULT_SERIES_ID);
  const [progress, setProgress] = useState(0);
  const player = useVideoPlayer(uri || null, (preview) => {
    preview.loop = false;
  });
  const queryClient = useQueryClient();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPlaying) setStarted(true);
  }, [isPlaying]);

  const upload = useMutation({
    mutationFn: () =>
      uploadVideo({
        uri,
        // The typed title becomes the file name, so the list can show it
        fileName: uploadFileName(title, videoName),
        contentType,
        onProgress: setProgress,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      Alert.alert('Uploaded', 'Your video has been uploaded.');
      router.back();
    },
    onError: (error) => {
      setProgress(0);
      const message = error instanceof Error ? error.message : 'The video could not be uploaded. Please try again.';
      Alert.alert('Upload failed', message);
    },
  });

  function save() {
    const caption = title.trim();
    if (!caption) {
      Alert.alert('Title required', 'Please add a title for this video.');
      return;
    }
    if (!uri) {
      Alert.alert('Video missing', 'Choose a video again.');
      return;
    }
    setProgress(0);
    player.pause();
    upload.mutate();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} disabled={upload.isPending}>
            <Text style={styles.back}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Video details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
        {uri ? (
          <View style={styles.preview}>
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              contentFit="contain"
              nativeControls
            />
            {thumb && !started ? (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => player.play()}>
                <Image
                  source={{ uri: thumb }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
                <View style={styles.posterPlayWrap}>
                  <View style={styles.posterPlay}>
                    <View style={styles.posterTriangle} />
                  </View>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Add a title or caption"
          placeholderTextColor="#9A9A9A"
          style={styles.input}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {SERIES.map((series) => {
            const selected = series.id === seriesId;
            return (
              <Pressable
                key={series.id}
                onPress={() => setSeriesId(series.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {series.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {upload.isPending ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        ) : null}

        <Pressable
          style={[styles.save, !upload.isPending && styles.saveIdle]}
          onPress={save}
          disabled={upload.isPending}
        >
          <Text style={styles.saveText}>{upload.isPending ? `Uploading ${progress}%` : 'Save'}</Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  content: {
    paddingBottom: 24,
  },
  posterPlayWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlay: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterTriangle: {
    width: 0,
    height: 0,
    marginLeft: 5,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#ffffff',
  },
  headerSpacer: {
    width: 56,
  },
  preview: {
    marginHorizontal: 16,
    height: 280,
    borderRadius: 12,
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  label: {
    marginTop: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  input: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  chipText: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  progressTrack: {
    marginTop: 28,
    marginHorizontal: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E6E6E6',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1A1A1A',
  },
  saveIdle: {
    marginTop: 28,
  },
  save: {
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
