import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useJournal } from '../JournalContext';
import {
  addDays,
  displayDate,
  toRfc3339Utc,
  today,
  type JournalDate,
} from '../domain/date';
import { plannedSave, trimBody } from '../domain/save';
import { confirm, notify } from '../platform/confirm';

/**
 * Write is the home screen: a date header with day-stepping arrows, the editor,
 * and a save button.
 *
 * The editor is a real TextInput, which on Android is a real EditText and on
 * the web is a real textarea. That is the entire reason this implementation
 * exists, so resist any temptation to wrap it in something clever.
 */
export function WriteScreen() {
  const { store, now, revision, bump, guard, onSaved } = useJournal();

  const [date, setDate] = useState<JournalDate>(() => today(now()));
  const [loaded, setLoaded] = useState('');
  const [text, setText] = useState('');
  const [exists, setExists] = useState(false);

  const isToday = date === today(now());
  const dirty = text !== loaded;

  /** show loads d into the editor, replacing whatever was there. */
  const show = useCallback(
    async (d: JournalDate) => {
      try {
        const entry = await store.get(d);
        setDate(d);
        setExists(entry !== null);
        setLoaded(entry?.body ?? '');
        setText(entry?.body ?? '');
      } catch (err) {
        await notify('Could not read that day', (err as Error).message);
      }
    },
    [store],
  );

  // Reload on mount, and whenever an import has replaced what is underneath us.
  useEffect(() => {
    void show(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // While there are unsaved edits, the navigator must ask before leaving.
  useEffect(() => {
    if (!dirty) {
      guard.current = null;
      return;
    }
    guard.current = () =>
      confirm(
        'Discard changes?',
        `Your unsaved changes to ${displayDate(date)} will be lost.`,
      );
    return () => {
      guard.current = null;
    };
  }, [dirty, date, guard]);

  const step = async (days: number) => {
    const target = addDays(date, days);
    if (target > today(now())) return; // future-dated entries are out of scope
    if (dirty) {
      const discard = await confirm(
        'Discard changes?',
        `Your unsaved changes to ${displayDate(date)} will be lost.`,
      );
      if (!discard) return;
    }
    await show(target);
  };

  const save = async () => {
    const action = plannedSave(text, exists);
    if (action === 'noop') return;

    if (action === 'delete') {
      const remove = await confirm(
        'Delete this entry?',
        `Saving an empty entry for ${displayDate(date)} deletes it.`,
      );
      if (!remove) return;
      try {
        await store.delete(date);
      } catch (err) {
        await notify('Could not delete that entry', (err as Error).message);
        return;
      }
      setLoaded('');
      setText('');
      setExists(false);
      bump();
      guard.current = null;
      onSaved(date);
      return;
    }

    const body = trimBody(text);
    const stamp = toRfc3339Utc(now());
    try {
      const existing = await store.get(date);
      await store.put({
        date,
        body,
        // created is set once and preserved by every later edit.
        created: existing?.created ?? stamp,
        updated: stamp,
      });
      setLoaded(body);
      setText(body);
      setExists(true);
      bump();
    } catch (err) {
      await notify('Could not save that entry', (err as Error).message);
      return;
    }

    // The soft gate: writing today pays out immediately by revealing Memories,
    // which was reachable all along. The screen announces; the app decides.
    guard.current = null;
    onSaved(date);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable testID="write-prev" onPress={() => void step(-1)} style={styles.arrow}>
          <Text style={styles.arrowText}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text testID="write-header" style={styles.date}>
            {displayDate(date)}
          </Text>
          <Text testID="write-badge" style={styles.badge}>
            {isToday ? 'today' : ''}
          </Text>
        </View>
        <Pressable
          testID="write-next"
          disabled={isToday}
          onPress={() => void step(1)}
          style={[styles.arrow, isToday && styles.arrowDisabled]}
        >
          <Text style={styles.arrowText}>{'>'}</Text>
        </Pressable>
      </View>

      <TextInput
        testID="write-body"
        style={styles.body}
        value={text}
        onChangeText={setText}
        placeholder="What happened today?"
        multiline
        textAlignVertical="top"
      />

      <Pressable testID="write-save" onPress={() => void save()} style={styles.save}>
        <Text style={styles.saveText}>Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  date: { fontSize: 18, fontWeight: 'bold' },
  badge: { fontStyle: 'italic', minHeight: 18 },
  arrow: { padding: 12 },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 20 },
  body: { flex: 1, marginVertical: 12, fontSize: 16 },
  save: { padding: 14, alignItems: 'center', borderRadius: 6 },
  saveText: { fontSize: 16, fontWeight: 'bold' },
});
