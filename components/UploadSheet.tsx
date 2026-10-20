import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { setSelectedVideo } from '../lib/selectedVideo';

type Props = {
  visible: boolean;
  onClose: () => void;
};

async function captureFrame(uri: string) {
  try {
    const frame = await VideoThumbnails.getThumbnailAsync(uri, { time: 2000 });
    return frame.uri;
  } catch {
    const frame = await VideoThumbnails.getThumbnailAsync(uri, { time: 0 });
    return frame.uri;
  }
}

async function copyToCache(uri: string, name: string) {
  const root = FileSystem.cacheDirectory;
  if (!root) {
    throw new Error('Cache directory is not available.');
  }
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 80);
  const dest = `${root}${Date.now()}-${safeName || 'video.mp4'}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

function fileNameFromUri(uri: string) {
  const name = uri.split('?')[0].split('/').pop();
  if (!name) return `video-${Date.now()}.mp4`;
  return name.includes('.') ? name : `${name}.mp4`;
}

export default function UploadSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function recordVideo() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera', 'Camera access is needed to record a video.');
      return;
    }

    await openPicker(() =>
      ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 60,
      })
    );
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Gallery', 'Photo library access is needed to choose a video.');
      return;
    }

    await openPicker(() =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
      })
    );
  }

  async function openPicker(launch: () => Promise<ImagePicker.ImagePickerResult>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await launch();
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const videoName = asset.fileName || fileNameFromUri(asset.uri);
      const contentType = asset.mimeType || 'video/mp4';
      const uri = await copyToCache(asset.uri, videoName);
      let thumb = '';
      try {
        thumb = await captureFrame(uri);
      } catch {
        thumb = '';
      }

      setSelectedVideo({ uri, thumb, videoName, contentType });
      onClose();
      router.push('/video-details');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      Alert.alert(
        'Video',
        detail
          ? `The selected video could not be read. ${detail}`
          : 'The selected video could not be read. Please choose it again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Upload</Text>

        <Pressable style={styles.option} onPress={recordVideo} disabled={busy}>
          <Text style={styles.optionTitle}>Record</Text>
          <Text style={styles.optionLine}>Open the camera and record live</Text>
        </Pressable>

        <Pressable style={styles.option} onPress={pickFromGallery} disabled={busy}>
          <Text style={styles.optionTitle}>Gallery</Text>
          <Text style={styles.optionLine}>Choose a video already on your phone</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9D9D9',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  option: {
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  optionLine: {
    marginTop: 4,
    fontSize: 14,
    color: '#5C5C5C',
  },
});
