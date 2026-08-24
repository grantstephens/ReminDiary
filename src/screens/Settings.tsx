import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useJournal } from '../JournalContext';
import { displayDate, today } from '../domain/date';
import { computeStats, type Stats } from '../domain/stats';
import { exportCsv, exportFileName } from '../csv/export';
import { formatRowError, importCsv, type ImportResult } from '../csv/import';
import { getAnalyticsEnabled, setAnalyticsEnabled } from '../platform/analytics';
import { confirm, notify } from '../platform/confirm';
import { pickCsv, saveCsv } from '../platform/files';
import { useTheme } from '../ThemeContext';
import type { Theme, ThemeMode } from '../theme';

const APPEARANCE_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

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
 * How many failed rows the result message quotes, so a thoroughly broken file
 * does not produce an unreadable wall of text.
 */
const MAX_REPORTED_ROWS = 5;

/** formatImportResult renders the receipt shown after an import. */
export function formatImportResult(result: ImportResult): string {
  const lines = [
    `Imported ${result.imported}. Skipped ${result.skipped} existing. Failed ${result.failed}.`,
  ];
  const shown = result.errors.slice(0, MAX_REPORTED_ROWS);
  for (const e of shown) lines.push(formatRowError(e));
  const omitted = result.errors.length - shown.length;
  if (omitted > 0) lines.push(`…and ${omitted} more.`);
  return lines.join('\n');
}

/**
 * Settings combines the statistics and import/export screens into one -
 * numbers at the top, data management below - rather than splitting a
 * handful of low-traffic, non-writing concerns across two tabs.
 */
export function SettingsScreen() {
  const { store, now, revision, bump } = useJournal();
  const { theme, mode, setMode } = useTheme();
  const styles = createStyles(theme);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAnalyticsEnabled().then((enabled) => {
      if (!cancelled) setAnalyticsEnabledState(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggleAnalytics = (enabled: boolean) => {
    setAnalyticsEnabledState(enabled);
    void setAnalyticsEnabled(enabled);
  };

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

  const runImport = async () => {
    // Overwrite is the one setting that can destroy data, so it is confirmed
    // before the picker rather than after, when the user still has context.
    if (overwrite) {
      const go = await confirm(
        'Overwrite existing entries?',
        'Entries in the file will replace entries you already have for the same dates. ' +
          'This cannot be undone.',
      );
      if (!go) return;
    }

    setBusy(true);
    try {
      // pickCsv is INSIDE the try: a rejecting document picker, or an
      // unreadable/stale SAF content URI, would otherwise become an unhandled
      // rejection - no dialog, no receipt, nothing - since runImport is
      // invoked as `void runImport()`.
      const picked = await pickCsv();
      if (picked === null) return; // cancelled, which is not an error

      const result = await importCsv(picked.text, store, overwrite, now());
      bump();
      await notify('Import complete', formatImportResult(result));
    } catch (err) {
      await notify('Could not import that file', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    try {
      const text = await exportCsv(store);
      const written = await saveCsv(exportFileName(today(now())), text);
      await notify('Export complete', `Your journal has been written to ${written}.`);
    } catch (err) {
      await notify('Could not export your journal', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {statsLines(stats).map((line, i) => (
        <Text key={line} testID={`stats-line-${i}`} style={styles.statsLine}>
          {line}
        </Text>
      ))}

      <View style={styles.divider} />

      <Text style={styles.explain}>
        Import merges a CSV into your journal. Dates you already have are skipped unless you
        tick overwrite. Export writes every entry to a CSV file.
      </Text>

      <View style={styles.row}>
        <Switch testID="data-overwrite" value={overwrite} onValueChange={setOverwrite} />
        <Text style={styles.rowLabel}>Overwrite existing entries</Text>
      </View>

      <Pressable
        testID="data-import"
        disabled={busy}
        onPress={() => void runImport()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Import CSV</Text>
      </Pressable>

      <Pressable
        testID="data-export"
        disabled={busy}
        onPress={() => void runExport()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Export CSV</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Analytics</Text>
      <Text style={styles.explain}>
        Share anonymous screen-view counts to help understand how this app is used. Off by
        default. No entry content, dates, or other personal data are ever sent.
      </Text>
      <View style={styles.row}>
        <Switch
          testID="analytics-enabled"
          value={analyticsEnabled}
          onValueChange={onToggleAnalytics}
        />
        <Text style={styles.rowLabel}>Share anonymous usage analytics</Text>
      </View>

      {Platform.OS !== 'web' && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.pillRow}>
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  testID={`appearance-${option.mode}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setMode(option.mode)}
                  style={[styles.pill, selected && styles.pillSelected]}
                >
                  <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.background },
    content: { padding: 16 },
    statsLine: { fontSize: 16, marginBottom: 10, color: theme.text },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 20 },
    explain: { fontSize: 15, marginBottom: 20, color: theme.text },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    rowLabel: { marginLeft: 10, fontSize: 15, color: theme.text },
    button: {
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 6,
      marginBottom: 12,
      backgroundColor: theme.surface,
    },
    buttonText: { fontSize: 16, fontWeight: 'bold', color: theme.accent },
    sectionLabel: { fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: theme.text },
    pillRow: { flexDirection: 'row', gap: 8 },
    pill: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 6,
      backgroundColor: theme.surface,
    },
    pillSelected: { backgroundColor: theme.accent },
    pillText: { fontSize: 14, fontWeight: 'bold', color: theme.text },
    pillTextSelected: { color: theme.background },
  });
}
