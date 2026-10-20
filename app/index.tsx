import { useRef } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const SPLASH_MS = 5000;
const THUMB = require('../assets/splash.jpg');

export default function SplashScreen() {
  const started = useRef(false);

  function holdSplash() {
    if (started.current) return;
    started.current = true;
    setTimeout(() => router.replace('/home'), SPLASH_MS);
  }

  return (
    <View style={styles.splash}>
      <StatusBar style="dark" />
      <Image source={THUMB} style={styles.photo} resizeMode="cover" onLoadEnd={holdSplash} />
      <View style={styles.titleBlock}>
        <Text style={styles.title}>WISDEN</Text>
        <View style={styles.rule} />
        <Text style={styles.subtitle}>CRICKET</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  titleBlock: {
    position: 'absolute',
    top: '13%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 40,
    letterSpacing: 8,
    color: '#1A1A1A',
    fontWeight: '600',
  },
  rule: {
    width: 42,
    height: 2,
    backgroundColor: '#C4A35A',
    marginTop: 10,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    letterSpacing: 6,
    color: '#5C5C5C',
    fontWeight: '600',
  },
});
