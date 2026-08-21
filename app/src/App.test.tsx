import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import App from './App';
import { SqliteStore } from './storage/SqliteStore';
import { openNodeSqlite } from './storage/nodeSqlite';

jest.mock('./storage/openStore');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openStore } = require('./storage/openStore') as {
  openStore: jest.Mock;
};

test('shows the four tabs once the store opens', async () => {
  openStore.mockResolvedValue(await SqliteStore.open(openNodeSqlite(':memory:')));
  render(<App />);
  await waitFor(() => expect(screen.getByText('Write')).toBeTruthy());
  expect(screen.getByText('Memories')).toBeTruthy();
  expect(screen.getByText('Stats')).toBeTruthy();
  expect(screen.getByText('Data')).toBeTruthy();
});

// A failed database open must render something a human can read, not a blank
// screen and not a redbox.
test('renders an error screen when the store will not open', async () => {
  openStore.mockRejectedValue(new Error('disk is on fire'));
  render(<App />);
  await waitFor(() => expect(screen.getByText(/could not open your journal/i)).toBeTruthy());
  expect(screen.getByText(/disk is on fire/)).toBeTruthy();
});
