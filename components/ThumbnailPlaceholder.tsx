import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

// Shown while a video has no real thumbnail. The colour comes from the video
// key, so the same video always gets the same colour.
const COLORS = ['#1F6F50', '#2D4A7C', '#7C3A2D', '#5A3E85', '#3B6B78', '#8A6D1F'];

function colorFor(seed: string) {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return COLORS[sum % COLORS.length];
}

export default function ThumbnailPlaceholder({
  seed,
  style,
}: {
  seed: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.box, { backgroundColor: colorFor(seed) }, style]}>
      <View style={styles.shade} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
  },
  // A darker lower half gives a simple "gradient" look
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
