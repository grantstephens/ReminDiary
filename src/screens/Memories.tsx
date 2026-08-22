import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useJournal } from '../JournalContext';
import {
  dayOf,
  displayDayMonth,
  monthOf,
  today,
  yearOf,
  type JournalDate,
} from '../domain/date';
import type { Entry } from '../domain/entry';
import { notify } from '../platform/confirm';

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
  const { store, now, revision } = useJournal();
  const [shown, setShown] = useState<Entry[]>([]);
  const [day, setDay] = useState<JournalDate>(() => today(now()));

  // revision is the refresh trigger, not screen focus. Nothing but this app
  // can change the data, and every path that does bumps it — so a plain effect
  // is both sufficient and testable without mounting a navigator.
  useEffect(() => {
    let cancelled = false;
    const current = today(now());
    setDay(current);
    store
      .onThisDay(monthOf(current), dayOf(current))
      .then((found) => {
        if (cancelled) return;
        // onThisDay includes the current year; the whole point of this screen
        // is previous years, so drop it here.
        setShown(found.filter((e) => yearOf(e.date) < yearOf(current)));
      })
      .catch((err: unknown) => {
        if (!cancelled) void notify('Could not read your memories', (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [store, now, revision]);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {shown.length === 0 ? (
        <Text testID="memories-empty" style={styles.empty}>
          {emptyMemoriesText(day)}
        </Text>
      ) : (
        shown.map((e) => (
          <View key={e.date} style={styles.item}>
            <Text testID={`memories-heading-${yearOf(e.date)}`} style={styles.heading}>
              {`${yearOf(e.date)} — ${yearsAgoLabel(yearOf(day) - yearOf(e.date))}`}
            </Text>
            <Text style={styles.body}>{e.body}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  empty: { fontSize: 16 },
  item: { marginBottom: 20 },
  heading: { fontWeight: 'bold', marginBottom: 4 },
  body: { fontSize: 16 },
});
