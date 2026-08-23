import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
import { onAppHidden } from '../platform/lifecycle';
import { useTheme } from '../ThemeContext';
import type { Theme } from '../theme';

/**
 * Write is the home screen: a date header with day-stepping arrows, the editor,
 * and a save button.
 *
 * The editor is a real TextInput, which on Android is a real EditText and on
 * the web is a real textarea. That is the entire reason this implementation
 * exists, so resist any temptation to wrap it in something clever.
 */
export function WriteScreen() {
  const { store, now, revision, bump, guard, onSaved, openDate } = useJournal();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [date, setDate] = useState<JournalDate>(() => today(now()));
  const [loaded, setLoaded] = useState('');
  const [text, setText] = useState('');
  const [exists, setExists] = useState(false);
  const [editing, setEditing] = useState(false);
  const hideDelay = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On the web target, tapping the Save button blurs the still-focused
  // editor synchronously before the button's own press event fires - a
  // standard DOM race (mousedown blurs the old focus target before its own
  // click lands). Hiding on blur immediately would unmount the button
  // mid-tap and swallow that press, so the hide is deferred briefly; a
  // refocus within that window (startEditing) cancels it.
  const startEditing = useCallback(() => {
    if (hideDelay.current !== null) {
      clearTimeout(hideDelay.current);
      hideDelay.current = null;
    }
    setEditing(true);
  }, []);
  const stopEditing = useCallback(() => {
    hideDelay.current = setTimeout(() => {
      setEditing(false);
      hideDelay.current = null;
    }, 150);
  }, []);
  useEffect(
    () => () => {
      if (hideDelay.current !== null) clearTimeout(hideDelay.current);
    },
    [],
  );

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

  /**
   * persist writes the current editor text as an entry for `date` and syncs
   * local state to match. Shared by the explicit Save button and every
   * silent-save path below, so a failed write behaves identically wherever
   * it happens.
   */
  const persist = useCallback(async () => {
    const body = trimBody(text);
    const stamp = toRfc3339Utc(now());
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
  }, [store, date, text, now, bump]);

  /**
   * silentSave is what leaving the current entry without pressing Save does -
   * on a tab switch, a date step, or the app backgrounding. Non-empty edits
   * are written; a cleared box is never treated as a delete (that stays an
   * explicit, confirmed action in save() below), so it just reverts to what
   * was last saved instead. Resolves false only when persisting failed, so a
   * tab switch or date step can stay put rather than lose the unsaved text.
   */
  const silentSave = useCallback(async (): Promise<boolean> => {
    const action = plannedSave(text, exists);
    if (action === 'noop') return true;
    if (action === 'delete') {
      setText(loaded);
      return true;
    }
    try {
      await persist();
      return true;
    } catch (err) {
      await notify('Could not save that entry', (err as Error).message);
      return false;
    }
  }, [text, exists, loaded, persist]);

  // While there are unsaved edits, the navigator saves silently before
  // letting a tab press through, rather than asking.
  useEffect(() => {
    if (!dirty) {
      guard.current = null;
      return;
    }
    guard.current = silentSave;
    return () => {
      guard.current = null;
    };
  }, [dirty, guard, silentSave]);

  // The same silent save runs when the app is about to leave the foreground,
  // so backgrounding or closing it never loses what was being written.
  //
  // silentSave gets a new identity every keystroke (it closes over `text`
  // via persist), so subscribing with it as a direct effect dependency would
  // tear down and re-add the underlying native listener on every character
  // typed. The ref keeps the subscription itself mount-once while still
  // always calling the latest silentSave.
  const latestSilentSave = useRef(silentSave);
  useEffect(() => {
    latestSilentSave.current = silentSave;
  }, [silentSave]);
  useEffect(() => onAppHidden(() => void latestSilentSave.current()), []);

  /**
   * goTo silently saves any unsaved edits to the current entry, the same rule
   * as leaving via a tab switch, then loads `target`. Shared by the date-step
   * arrows and by Memories asking to open a specific date for editing.
   */
  const goTo = useCallback(
    async (target: JournalDate) => {
      if (dirty) {
        const ok = await silentSave();
        if (!ok) return;
      }
      await show(target);
    },
    [dirty, silentSave, show],
  );

  const step = async (days: number) => {
    const target = addDays(date, days);
    if (target > today(now())) return; // future-dated entries are out of scope
    await goTo(target);
  };

  // Memories tapping an entry sets openDate on the shared context; a fresh
  // object every call (see JournalContext) so this fires even for a repeat
  // request of the same date.
  useEffect(() => {
    if (openDate === null) return;
    void goTo(openDate.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDate]);

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

    try {
      await persist();
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
    <KeyboardAvoidingView
      style={styles.screen}
      // 'undefined' on Android is only a no-op-and-that's-fine when the OS
      // itself resizes the window for the keyboard (android:windowSoftInputMode
      // set via a native build). Under Expo Go there is no such build, so
      // Android needs 'height' just as much as iOS needs 'padding'.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
        onFocus={startEditing}
        onBlur={stopEditing}
        placeholder="What happened today?"
        placeholderTextColor={theme.textMuted}
        multiline
        textAlignVertical="top"
      />

      {editing && (
        // Only shown while the keyboard is up (the tab bar's own place while
        // typing, per tabBarHideOnKeyboard in App.tsx) - it always reads the
        // same thing regardless of what save() will actually do; the delete
        // confirmation dialog is what explains that specific case.
        <Pressable testID="write-save" onPress={() => void save()} style={styles.save}>
          <Text style={styles.saveText}>Take Me to Memories →</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, padding: 12, backgroundColor: theme.background },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerText: { flex: 1, alignItems: 'center' },
    date: { fontSize: 18, fontWeight: 'bold', color: theme.text },
    badge: { fontStyle: 'italic', minHeight: 18, color: theme.textMuted },
    arrow: { padding: 12 },
    arrowDisabled: { opacity: 0.3 },
    arrowText: { fontSize: 20, color: theme.text },
    body: { flex: 1, marginVertical: 12, fontSize: 16, color: theme.text },
    save: {
      padding: 14,
      alignItems: 'center',
      borderRadius: 6,
      backgroundColor: theme.surface,
    },
    saveText: { fontSize: 16, fontWeight: 'bold', color: theme.accent },
  });
}
