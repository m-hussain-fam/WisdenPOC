import { useState } from 'react';
import { Tabs } from 'expo-router';
import { ColorValue, Pressable, StyleSheet, Text, View } from 'react-native';
import UploadSheet from '../../components/UploadSheet';

export default function TabLayout() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1A1A1A',
        tabBarInactiveTintColor: '#8A8A8A',
        tabBarStyle: styles.bar,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload',
          tabBarButton: () => (
            <Pressable style={styles.uploadButton} onPress={() => setSheetOpen(true)}>
              <UploadIcon />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
    <UploadSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

function HomeIcon({ color }: { color: ColorValue }) {
  return (
    <View style={styles.homeIcon}>
      <View style={[styles.roof, { borderBottomColor: color }]} />
      <View style={[styles.house, { borderColor: color }]} />
    </View>
  );
}

function UploadIcon() {
  return (
    <View style={styles.upload}>
      <Text style={styles.plus}>+</Text>
    </View>
  );
}

function ProfileIcon({ color }: { color: ColorValue }) {
  return (
    <View style={styles.profileIcon}>
      <View style={[styles.head, { backgroundColor: color }]} />
      <View style={[styles.body, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#EEEEEE',
    height: 64,
    paddingTop: 6,
  },
  homeIcon: {
    alignItems: 'center',
  },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  house: {
    width: 12,
    height: 8,
    borderWidth: 2,
    borderTopWidth: 0,
  },
  uploadButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upload: {
    width: 52,
    height: 52,
    marginBottom: 18,
    borderRadius: 26,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 32,
    marginTop: -2,
  },
  profileIcon: {
    alignItems: 'center',
  },
  head: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    width: 14,
    height: 7,
    marginTop: 2,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
});
