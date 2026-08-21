/**
 * Reading a CSV in and writing one out, on both targets.
 *
 * Implementations live in files.native.ts and files.web.ts; Metro picks one by
 * platform extension. Neither one assumes a real filesystem path exists,
 * because on the web it does not — the same discipline as the Go app's rule
 * about writing through a URIWriteCloser rather than a path.
 */

/** A file the user chose. null means they cancelled, which is not an error. */
export interface PickedFile {
  name: string;
  text: string;
}

/**
 * pickCsv asks for a file and reads it as UTF-8 text.
 *
 * Resolves null when the user cancels — on native. A browser fires no event
 * for a dismissed file dialog, so on web a cancelled pick simply never
 * resolves. Nothing is waiting on it but a dialog that should not appear, so
 * that is harmless; it is documented here because the contract otherwise
 * reads as though null were guaranteed on both targets.
 */
export declare function pickCsv(): Promise<PickedFile | null>;

/**
 * saveCsv hands text to the user as a file and returns the name it was given.
 *
 * Neither platform can report a cancelled save: Android hands off to a share
 * sheet and never hears back, and a browser download has no completion event.
 * So this never resolves null, and callers should not branch on it.
 */
export declare function saveCsv(name: string, text: string): Promise<string>;
