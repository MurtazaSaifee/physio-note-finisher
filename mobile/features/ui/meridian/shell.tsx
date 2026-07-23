import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CalendarDays, UsersRound, CircleUserRound } from 'lucide-react-native';
import { meridian } from './tokens';
import { typography } from './typography';
import { MeridianActionSurface } from './primitives';
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MeridianDestinationKey =
  | "calendar"
  | "patients"
  | "profile";

export type MeridianDestination = {
  key: MeridianDestinationKey;
  label: "Calendar" | "Patients" | "Profile";
  state: "working" | "inert";
};

export const DESTINATIONS: MeridianDestination[] = [
  { key: "patients", label: "Patients", state: "working" },
  { key: "calendar", label: "Calendar", state: "working" },
  { key: "profile", label: "Profile", state: "working" },
];

export function MeridianTopAppBar({ title }: { title: string }) {
  return (
    <View style={styles.topAppBar}>
      <Text style={styles.topAppBarTitle}>{title}</Text>
    </View>
  );
}

export function MeridianBottomNav({ currentDestination, onNavigate }: { currentDestination: MeridianDestinationKey, onNavigate: (key: MeridianDestinationKey) => void }) {
  const insets = useSafeAreaInsets();
  const getIcon = (key: MeridianDestinationKey, color: string) => {
    switch (key) {
      case 'calendar': return <CalendarDays color={color} size={24} />;
      case 'patients': return <UsersRound color={color} size={24} />;
      case 'profile': return <CircleUserRound color={color} size={24} />;
    }
  };

  return (
    <View style={[styles.dockContainer, { paddingBottom: meridian.spacing.sm + insets.bottom }]}>
      {DESTINATIONS.map((dest) => {
        const isActive = currentDestination === dest.key;
        const color = isActive ? meridian.color.primary : meridian.color.textSubtle;
        
        return (
          <Pressable
            key={dest.key}
            onPress={() => onNavigate(dest.key)}
            disabled={dest.state === 'inert'}
            focusable={dest.state === 'working'}
            accessibilityRole="button"
            accessibilityLabel={dest.label}
            accessibilityState={{ disabled: dest.state === 'inert', selected: isActive }}
            testID={`bottom-nav-${dest.key}`}
            style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
          >
            <View style={[styles.iconContainer, isActive && styles.iconActive]}>
              {getIcon(dest.key, color)}
            </View>
            <Text style={[typography.label, { color, fontSize: 10, marginTop: 4 }]}>{dest.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MeridianProtectedShell({
  children,
  currentDestination,
  onNavigate,
  title,
  showTopBar = true,
  showBottomNav = true,
}: {
  children: React.ReactNode;
  currentDestination: MeridianDestinationKey;
  onNavigate: (key: MeridianDestinationKey) => void;
  title: string;
  showTopBar?: boolean;
  showBottomNav?: boolean;
}) {
  const dest = DESTINATIONS.find(d => d.key === currentDestination);
  return (
    <View style={styles.shell}>
      {showTopBar ? <MeridianTopAppBar title={title} /> : null}
      <View style={styles.content}>
        {dest?.state === 'inert' ? (
           <View style={{ padding: 16 }}>
             <MeridianActionSurface title={dest.label} disabled={true} />
           </View>
        ) : children}
      </View>
      {showBottomNav ? (
        <MeridianBottomNav currentDestination={currentDestination} onNavigate={onNavigate} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  topAppBar: {
    paddingHorizontal: meridian.spacing.lg,
    paddingVertical: meridian.spacing.md,
    backgroundColor: meridian.color.background,
    borderBottomColor: meridian.color.border,
    borderBottomWidth: 1,
  },
  topAppBarTitle: {
    ...typography.heading,
  },
  content: {
    flex: 1,
    paddingTop: meridian.spacing.md,
  },
  dockContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: meridian.color.background,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopColor: meridian.color.border,
    borderTopWidth: 1,
    marginHorizontal: 0,
    marginTop: meridian.spacing.md,
    marginBottom: 0,
    padding: meridian.spacing.sm,
    paddingHorizontal: meridian.spacing.md,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: meridian.spacing.xs,
  },
  navItemPressed: {
    opacity: 0.72,
  },
  iconContainer: {
    padding: 6,
    borderRadius: meridian.radius.control,
  },
  iconActive: {
    backgroundColor: meridian.color.primarySoft,
  }
});
