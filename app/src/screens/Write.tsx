import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  // save() and step() run as detached async work off a Pressable's onPress,
  // not from a render. They must never read date/text/loaded/exists by
  // closing over this render's state: a ref is the same object across every
  // render, so a handler reads whatever was most recently written to it
  // rather than whatever this particular render happened to close over.
  const dateRef = useRef(date);
  const loadedRef = useRef(loaded);
  const textRef = useRef(text);
  const existsRef = useRef(exists);
  // The original created timestamp, tracked alongside loadedRef so save()
  // never has to re-fetch the row it already read in show() just to find it.
  const createdRef = useRef<string | null>(null);

  // save()/delete already know exactly what they just wrote and have put it
  // straight into state and the refs above. The revision bump that follows is
  // for the *other* screens; without this flag Write would immediately
  // re-fetch the very row it just wrote, an extra async round trip with
  // nothing to gain from it.
  const skipNextReload = useRef(false);

  const isToday = date === today(now());
  const dirty = text !== loaded;

  /** show loads d into the editor, replacing whatever was there. */
  const show = useCallback(
    async (d: JournalDate) => {
      try {
        const entry = await store.get(d);
        dateRef.current = d;
        existsRef.current = entry !== null;
        loadedRef.current = entry?.body ?? '';
        textRef.current = entry?.body ?? '';
        createdRef.current = entry?.created ?? null;
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
    if (skipNextReload.current) {
      skipNextReload.current = false;
      return;
    }
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
    const target = addDays(dateRef.current, days);
    if (target > today(now())) return; // future-dated entries are out of scope
    if (textRef.current !== loadedRef.current) {
      const discard = await confirm(
        'Discard changes?',
        `Your unsaved changes to ${displayDate(dateRef.current)} will be lost.`,
      );
      if (!discard) return;
    }
    await show(target);
  };

  const onChangeText = (t: string) => {
    textRef.current = t;
    setText(t);
  };

  const save = async () => {
    const currentDate = dateRef.current;
    const action = plannedSave(textRef.current, existsRef.current);
    if (action === 'noop') return;

    if (action === 'delete') {
      const remove = await confirm(
        'Delete this entry?',
        `Saving an empty entry for ${displayDate(currentDate)} deletes it.`,
      );
      if (!remove) return;
      try {
        await store.delete(currentDate);
      } catch (err) {
        await notify('Could not delete that entry', (err as Error).message);
        return;
      }
      loadedRef.current = '';
      textRef.current = '';
      existsRef.current = false;
      createdRef.current = null;
      setLoaded('');
      setText('');
      setExists(false);
      skipNextReload.current = true;
      bump();
      guard.current = null;
      onSaved(currentDate);
      return;
    }

    const body = trimBody(textRef.current);
    const stamp = toRfc3339Utc(now());
    // created is set once and preserved by every later edit. show() already
    // read it off the row this render is editing, so there is no need to
    // fetch it again here.
    const created = createdRef.current ?? stamp;
    try {
      await store.put({
        date: currentDate,
        body,
        created,
        updated: stamp,
      });
      loadedRef.current = body;
      textRef.current = body;
      existsRef.current = true;
      createdRef.current = created;
      setLoaded(body);
      setText(body);
      setExists(true);
      skipNextReload.current = true;
      bump();
    } catch (err) {
      await notify('Could not save that entry', (err as Error).message);
      return;
    }

    // The soft gate: writing today pays out immediately by revealing Memories,
    // which was reachable all along. The screen announces; the app decides.
    guard.current = null;
    onSaved(currentDate);
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
        onChangeText={onChangeText}
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
