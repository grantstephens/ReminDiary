import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useJournal } from '../JournalContext';
import { displayDate, today } from '../domain/date';
import { computeStats, type Stats } from '../domain/stats';
import { notify } from '../platform/confirm';

const EMPTY: Stats = { current: 0, longest: 0, total: 0, since: null };

/** days renders a day count with the correct plural. */
export function days(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

/** statsLines renders statistics as display lines. */
export function statsLines(stats: Stats): string[] {
  if (stats.total === 0 || stats.since === null) {
    return ['No entries yet. Write something today.'];
  }
  return [
    `Current streak: ${days(stats.current)}`,
    `Longest streak: ${days(stats.longest)}`,
    `Total entries: ${stats.total}`,
    `Writing since: ${displayDate(stats.since)}`,
  ];
}

/**
 * Stats is the statistics screen. Its numbers are always derived from the
 * store, never cached, which is why there is no invalidation to get wrong.
 */
export function StatsScreen() {
  const { store, now, revision } = useJournal();
  const [stats, setStats] = useState<Stats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    store
      .dates()
      .then((dates) => {
        if (!cancelled) setStats(computeStats(dates, today(now())));
      })
      .catch((err: unknown) => {
        if (!cancelled) void notify('Could not read your statistics', (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [store, now, revision]);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {statsLines(stats).map((line, i) => (
        <Text key={line} testID={`stats-line-${i}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  line: { fontSize: 16, marginBottom: 10 },
});
