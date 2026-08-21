import React from 'react';
import { Text, View } from 'react-native';

export function WriteScreen() {
  // Text reads "Write screen" rather than bare "Write": the bottom tab bar
  // already renders a "Write" label for this (the initially-focused) tab, and
  // since it is not lazy-unmounted, an identical string here would collide
  // with it under getByText. Placeholder only — Task 10 replaces this body.
  return (
    <View>
      <Text>Write screen</Text>
    </View>
  );
}
