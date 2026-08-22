import { plannedSave, trimBody } from './save';

describe('plannedSave', () => {
  test('writes a non-empty body', () => {
    expect(plannedSave('hello', false)).toBe('write');
    expect(plannedSave('hello', true)).toBe('write');
  });

  // Clearing an entry and saving is how you delete one.
  test('deletes when an existing entry is cleared', () => {
    expect(plannedSave('', true)).toBe('delete');
    expect(plannedSave('   \n\t ', true)).toBe('delete');
  });

  // A blank editor on a blank day must not create an empty entry, or blank
  // days would start showing up in exports and streaks.
  test('does nothing on a blank day', () => {
    expect(plannedSave('', false)).toBe('noop');
    expect(plannedSave('   ', false)).toBe('noop');
  });
});

describe('trimBody', () => {
  test('strips trailing whitespace but keeps leading whitespace', () => {
    expect(trimBody('hello  \n\n')).toBe('hello');
    expect(trimBody('  indented')).toBe('  indented');
    expect(trimBody('line one\nline two\t ')).toBe('line one\nline two');
  });
});
