import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import type { JournalDate } from './domain/date';
import type { Store } from './domain/store';

/** A guard returns true when it is safe to leave the screen that registered it. */
export type UnsavedGuard = () => Promise<boolean>;

export interface JournalValue {
  store: Store;
  /**
   * now is injected rather than calling new Date() at the point of use, so a
   * test can pin "today" the same way nowFunc does in the Go app's UI tests.
   */
  now: () => Date;
  /**
   * revision changes whenever stored data changed underneath the screens. The
   * derived screens depend on it, which is this app's replacement for app.go
   * calling refreshDerived by hand.
   */
  revision: number;
  /** bump announces that stored data changed. */
  bump: () => void;
  /**
   * guard is set by the Write screen while it is holding unsaved edits, and
   * consulted by the navigator before it lets a tab press through.
   */
  guard: React.MutableRefObject<UnsavedGuard | null>;
  /**
   * onSaved is called after a successful save or delete. It is how the app
   * reveals the Memories tab, and it is a callback rather than a useNavigation
   * call inside Write for the same reason journal's Write.OnSaved is one in the
   * Go app: the screen should not know a navigator exists, and a screen test
   * should not have to mount one.
   */
  onSaved: (date: JournalDate) => void;
  /**
   * openDate is set by openWrite - Memories tapping an entry to edit it - and
   * read by the Write screen. An event carried in state rather than a plain
   * callback prop, the same reason revision is: a fresh object every call so
   * a later effect fires even if the same date is requested twice in a row.
   */
  openDate: { date: JournalDate } | null;
  /** openWrite asks to load `date` into the Write screen and switch to its tab. */
  openWrite: (date: JournalDate) => void;
}

const JournalContext = createContext<JournalValue | null>(null);

export function JournalProvider({
  store,
  now,
  onSaved = () => {},
  onOpenWrite = () => {},
  children,
}: {
  store: Store;
  now: () => Date;
  onSaved?: (date: JournalDate) => void;
  onOpenWrite?: () => void;
  children: React.ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  const [openDate, setOpenDate] = useState<JournalValue['openDate']>(null);
  const guard = useRef<UnsavedGuard | null>(null);

  const openWrite = useCallback(
    (date: JournalDate) => {
      setOpenDate({ date });
      onOpenWrite();
    },
    [onOpenWrite],
  );

  const value = useMemo<JournalValue>(
    () => ({
      store,
      now,
      revision,
      bump: () => setRevision((r) => r + 1),
      guard,
      onSaved,
      openDate,
      openWrite,
    }),
    [store, now, revision, onSaved, openDate, openWrite],
  );

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(): JournalValue {
  const value = useContext(JournalContext);
  if (value === null) {
    throw new Error('useJournal must be used inside a JournalProvider');
  }
  return value;
}
