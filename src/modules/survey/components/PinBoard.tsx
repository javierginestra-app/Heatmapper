import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { classifyRssi, type Vec3 } from '@/core';
import { colors } from '@/modules/ui';
import { type PlacedSample } from '../recorder';
import { pinFromTouch } from '../presentation';

const DOT = 8;
const PIN = 16;

/**
 * Top-down board of the location in metres (1 m grid). Tapping marks where the
 * phone is. Dots are individual measurements at their pins, not a heat map.
 */
export function PinBoard(props: {
  readonly widthM: number;
  readonly depthM: number;
  readonly pin: Vec3 | null;
  readonly placed: readonly PlacedSample[];
  readonly disabled: boolean;
  readonly onPlace: (pin: Vec3) => void;
}) {
  const { widthM, depthM, pin, placed, disabled, onPlace } = props;
  const [boardWidth, setBoardWidth] = useState(0);
  const scale = boardWidth / widthM;
  const gridLines = widthM <= 60 && depthM <= 60;

  return (
    <View onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Survey map. Tap where you are standing."
        disabled={disabled || scale <= 0}
        onPress={(e) => {
          const next = pinFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY, scale, widthM, depthM);
          if (next) onPlace(next);
        }}
        style={[styles.board, { height: scale > 0 ? depthM * scale : 0 }, disabled && styles.disabled]}
      >
        {gridLines &&
          Array.from({ length: Math.floor(widthM) + 1 }, (_, i) => (
            <View key={`v${i}`} pointerEvents="none" style={[styles.vLine, { left: i * scale }]} />
          ))}
        {gridLines &&
          Array.from({ length: Math.floor(depthM) + 1 }, (_, i) => (
            <View key={`h${i}`} pointerEvents="none" style={[styles.hLine, { top: i * scale }]} />
          ))}
        {placed.map(({ id, position, sample }) => (
          <View
            key={id}
            pointerEvents="none"
            style={[
              styles.dot,
              {
                left: position.x * scale - DOT / 2,
                top: position.z * scale - DOT / 2,
                backgroundColor: sample.kind === 'rssi' ? classifyRssi(sample.rssiDbm).color : colors.accent,
              },
            ]}
          />
        ))}
        {pin && (
          <View pointerEvents="none" style={[styles.pin, { left: pin.x * scale - PIN / 2, top: pin.z * scale - PIN / 2 }]} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, overflow: 'hidden' },
  disabled: { opacity: 0.6 },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  hLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  pin: { position: 'absolute', width: PIN, height: PIN, borderRadius: PIN / 2, borderWidth: 3, borderColor: '#FFFFFF' },
});
