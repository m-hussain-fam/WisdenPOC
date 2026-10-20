import { ImageBackground, StyleSheet, Text, View } from 'react-native';

const HERO = require('../assets/hero.jpg');

export default function Hero() {
  return (
    <View style={styles.wrap}>
      <ImageBackground source={HERO} style={styles.banner} imageStyle={styles.image}>
        <View style={styles.copy}>
          <Text style={styles.title}>Kingsmen Cricket</Text>
          <View style={styles.rule} />
          <Text style={styles.subtitle}>Let's play. Let's explore.</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingBottom: 20,
    backgroundColor: '#ffffff',
  },
  banner: {
    width: '100%',
    height: 240,
    justifyContent: 'flex-end',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  copy: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rule: {
    width: 36,
    height: 3,
    marginTop: 8,
    backgroundColor: '#F5C518',
  },
  subtitle: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
