import { ScrollView, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Hero from '../../components/Hero';
import LiveMatches from '../../components/LiveMatches';
import VideoList from '../../components/VideoList';

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <NativeStatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView style={styles.home} edges={['top']}>
        <Hero />
        <ScrollView>
          <LiveMatches />
          <VideoList />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  home: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
