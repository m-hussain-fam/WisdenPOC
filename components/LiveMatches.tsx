import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const LIVE_MATCHES = [
  {
    id: 'ind-aus',
    title: 'India vs Australia',
    image:
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'eng-pak',
    title: 'England vs Pakistan',
    image:
      'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'sa-nz',
    title: 'South Africa vs New Zealand',
    image:
      'https://images.unsplash.com/photo-1512719994953-eabf50895df7?auto=format&fit=crop&w=900&q=80',
  },
];

export default function LiveMatches() {
  const { width } = useWindowDimensions();
  const cardWidth = width * 0.72;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Live matches</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {LIVE_MATCHES.map((match) => (
          <Pressable key={match.id} style={[styles.card, { width: cardWidth }]}>
            <Image source={{ uri: match.image }} style={styles.image} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>LIVE</Text>
            </View>
            <View style={styles.caption}>
              <Text numberOfLines={1} style={styles.title}>
                {match.title}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    height: 250,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E8E8E8',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#D31212',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
