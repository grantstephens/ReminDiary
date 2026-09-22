import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { useJournal } from '../JournalContext';
import {
  addDays,
  dayOf,
  displayDate,
  displayDayMonth,
  monthOf,
  today,
  yearOf,
  type JournalDate,
} from '../domain/date';
import type { Entry } from '../domain/entry';
import { FALLBACK_PERIODS } from '../domain/fallbackMemory';
import { notify } from '../platform/confirm';
import { useTheme } from '../ThemeContext';
import type { Theme } from '../theme';

/** yearsAgoLabel renders the relative age of an entry. */
export function yearsAgoLabel(years: number): string {
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * emptyMemoriesText is the first-year empty state, naming the day so it reads
 * as an invitation rather than an error.
 */
export function emptyMemoriesText(day: JournalDate): string {
  return `Nothing from previous years yet. Come back next ${displayDayMonth(day)}.`;
}

/**
 * Memories is the On This Day screen: every previous year with an entry for
 * today's month and day, newest first. No cap and no paging — a dozen
 * anniversaries means a dozen entries in one scrollable list.
 */
export function MemoriesScreen() {
  const { store, now, revision, openWrite } = useJournal();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [shown, setShown] = useState<Entry[]>([]);
  const [fallback, setFallback] = useState<{ entry: Entry; label: string } | null>(null);
  const [day, setDay] = useState<JournalDate>(() => today(now()));

  // revision is the refresh trigger, not screen focus. Nothing but this app
  // can change the data, and every path that does bumps it — so a plain effect
  // is both sufficient and testable without mounting a navigator.
  useEffect(() => {
    let cancelled = false;
    const current = today(now());
    setDay(current);

    (async () => {
      try {
        const found = await store.onThisDay(monthOf(current), dayOf(current));
        if (cancelled) return;
        // onThisDay includes the current year; the whole point of this screen
        // is previous years, so drop it here.
        const years = found.filter((e) => yearOf(e.date) < yearOf(current));
        setShown(years);
        if (years.length > 0) {
          setFallback(null);
          return;
        }

        // No anniversary at all — either the account isn't a year old yet, or
        // this exact month/day was never written in any year present. Walk
        // the ladder largest-first and show the first period with a real
        // entry, so there is still something interesting to see.
        for (const period of FALLBACK_PERIODS) {
          const candidate = addDays(current, -period.days);
          const found2 = await store.get(candidate);
          if (cancelled) return;
          if (found2 !== null) {
            setFallback({ entry: found2, label: period.label });
            return;
          }
        }
        setFallback(null);
      } catch (err) {
        if (!cancelled) void notify('Could not read your memories', (err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store, now, revision]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
      {shown.length > 0 ? (
        shown.map((e) => (
          <TouchableRipple
            key={e.date}
            testID={`memories-item-${yearOf(e.date)}`}
            style={styles.item}
            onPress={() => openWrite(e.date)}
          >
            <View style={styles.itemContent}>
              <Text testID={`memories-heading-${yearOf(e.date)}`} variant="titleMedium" style={styles.heading}>
                {`${yearOf(e.date)} — ${yearsAgoLabel(yearOf(day) - yearOf(e.date))}`}
              </Text>
              <Text variant="bodyMedium">{e.body}</Text>
            </View>
          </TouchableRipple>
        ))
      ) : fallback !== null ? (
        <TouchableRipple
          testID="memories-fallback"
          style={styles.item}
          onPress={() => openWrite(fallback.entry.date)}
        >
          <View style={styles.itemContent}>
            <Text testID="memories-fallback-heading" variant="titleMedium" style={styles.heading}>
              {`${displayDate(fallback.entry.date)} — ${fallback.label}`}
            </Text>
            <Text variant="bodyMedium">{fallback.entry.body}</Text>
          </View>
        </TouchableRipple>
      ) : (
        <Text testID="memories-empty" variant="bodyLarge" style={styles.empty}>
          {emptyMemoriesText(day)}
        </Text>
      )}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.colors.background },
    list: { padding: 16 },
    empty: { color: theme.colors.onSurfaceVariant },
    item: {
      marginBottom: 16,
      borderRadius: theme.roundness * 3,
      backgroundColor: theme.colors.surfaceVariant,
      overflow: 'hidden',
    },
    itemContent: { padding: 16 },
    heading: { marginBottom: 4, color: theme.colors.primary },
  });
}
