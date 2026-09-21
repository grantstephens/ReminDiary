import type { JournalDate } from './date';

/** What saving the current editor contents would do. */
export type SaveAction =
  /** Write the editor contents as an entry. */
  | 'write'
  /** Remove an existing entry that has been cleared. */
  | 'delete'
  /** Do nothing: a blank editor on a date with no entry. */
  | 'noop';

/**
 * plannedSave reports what committing would do.
 *
 * Keeping the decision separate from the action is what lets the screen ask
 * for confirmation before a delete, and lets this rule be tested without
 * driving a dialog.
 */
export function plannedSave(text: string, exists: boolean): SaveAction {
  if (text.trim() === '') {
    return exists ? 'delete' : 'noop';
  }
  return 'write';
}

/**
 * shouldPromptForYesterday is true when saving today would leave yesterday
 * blank — the moment the streak rule is about to break. Keeping it pure lets
 * the screen ask the question without needing the store in domain tests.
 */
export function shouldPromptForYesterday(
  savedDate: JournalDate,
  todayDate: JournalDate,
  yesterdayExists: boolean,
): boolean {
  return savedDate === todayDate && !yesterdayExists;
}

/**
 * trimBody strips trailing whitespace before storage.
 *
 * Leading whitespace is deliberately preserved — someone indenting a line
 * meant it — which is also why the CSV writer has to quote a leading space.
 */
export function trimBody(text: string): string {
  return text.replace(/[ \t\r\n]+$/, '');
}
