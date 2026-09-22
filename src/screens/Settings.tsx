import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { Button, Divider, List, SegmentedButtons, Switch, Text } from 'react-native-paper';

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

  const openImportHelp = () => {
    Linking.openURL('https://remindiary.hub13.xyz/import/').catch((err: unknown) => {
      void notify('Could not open the help page', (err as Error).message);
    });
  };

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
        <Text key={line} testID={`stats-line-${i}`} variant="bodyLarge" style={styles.statsLine}>
          {line}
        </Text>
      ))}

      <Divider style={styles.divider} />

      <Text variant="bodyMedium" style={styles.explain}>
        Import merges a CSV into your journal. Dates you already have are skipped unless you
        tick overwrite. Export writes every entry to a CSV file.
      </Text>

      <Button
        testID="data-import-help"
        mode="text"
        compact
        style={styles.link}
        onPress={openImportHelp}
      >
        CSV format & example
      </Button>

      <List.Item
        title="Overwrite existing entries"
        style={styles.listItem}
        right={() => <Switch testID="data-overwrite" value={overwrite} onValueChange={setOverwrite} />}
      />

      <Button
        testID="data-import"
        mode="contained-tonal"
        disabled={busy}
        loading={busy}
        onPress={() => void runImport()}
        style={styles.button}
      >
        Import CSV
      </Button>

      <Button
        testID="data-export"
        mode="contained-tonal"
        disabled={busy}
        loading={busy}
        onPress={() => void runExport()}
        style={styles.button}
      >
        Export CSV
      </Button>

      <Divider style={styles.divider} />

      <Text variant="titleMedium" style={styles.sectionLabel}>
        Analytics
      </Text>
      <Text variant="bodyMedium" style={styles.explain}>
        Share anonymous screen-view counts to help understand how this app is used. Off by
        default. No entry content, dates, or other personal data are ever sent.
      </Text>
      <List.Item
        title="Share anonymous usage analytics"
        style={styles.listItem}
        right={() => (
          <Switch
            testID="analytics-enabled"
            value={analyticsEnabled}
            onValueChange={onToggleAnalytics}
          />
        )}
      />

      {Platform.OS !== 'web' && (
        <>
          <Divider style={styles.divider} />
          <Text variant="titleMedium" style={styles.sectionLabel}>
            Appearance
          </Text>
          <SegmentedButtons
            value={mode}
            onValueChange={(value) => setMode(value as ThemeMode)}
            buttons={APPEARANCE_OPTIONS.map((option) => ({
              value: option.mode,
              label: option.label,
              testID: `appearance-${option.mode}`,
            }))}
          />
        </>
      )}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.colors.background },
    content: { padding: 16 },
    statsLine: { marginBottom: 10 },
    divider: { marginVertical: 20 },
    explain: { marginBottom: 12 },
    link: { alignSelf: 'flex-start', marginLeft: -12, marginBottom: 8 },
    listItem: { paddingHorizontal: 0, marginBottom: 8 },
    button: { marginBottom: 12 },
    sectionLabel: { marginBottom: 12 },
  });
}
