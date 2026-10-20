import { extractMentionedUsernames } from './mentions';

describe('extractMentionedUsernames', () => {
  it.each([
    ['Hello @bob', ['bob']],
    ['Hello @bob, (@alice)!', ['bob', 'alice']],
    ['@bob\n@alice\t@chris_123', ['bob', 'alice', 'chris_123']],
    ['@bob, @bob!', ['bob']],
    ['Contact alice@example.org or @@bob', []],
    ['Hello everyone!', []],
  ])('extracts mentions from %j', (content, expected) => {
    expect(extractMentionedUsernames(content)).toEqual(expected);
  });
});
