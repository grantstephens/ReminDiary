/**
 * Placeholder text for a blank entry: one of these, chosen at random each
 * time an empty day is opened, instead of a single fixed prompt every time.
 */
export const PROMPTS: readonly string[] = [
  'What happened today?',
  "What's on your mind right now?",
  'What made you smile today?',
  'What was the hardest part of today?',
  'Who did you talk to today?',
  'What are you looking forward to?',
  'What surprised you today?',
  'What did you eat today?',
  'What did you learn today?',
  'What are you grateful for right now?',
  'What did you do to take care of yourself today?',
  "What's something you're worried about?",
  'Where were you at your happiest today?',
  'What did you avoid doing today?',
  'What conversation stuck with you today?',
  'What would you change about today?',
  'What did you spend too much time on today?',
  "What's something small that went right today?",
  'What did you notice about the weather today?',
  'What are you proud of today?',
  'What did you do for fun today?',
  'Who do you wish you had spoken to today?',
  'What is bothering you right now?',
  'What did you accomplish today?',
  'What is something you want to remember about today?',
  'What did today teach you about yourself?',
  'What are you curious about right now?',
  'What did you read, watch, or listen to today?',
  'What would you tell yourself this morning?',
  "What's one thing you're hoping tomorrow brings?",
];

/** randomPrompt picks one entry from PROMPTS, injectable for tests. */
export function randomPrompt(random: () => number = Math.random): string {
  const index = Math.floor(random() * PROMPTS.length);
  return PROMPTS[index];
}
