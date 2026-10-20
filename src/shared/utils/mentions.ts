/** Extract distinct @usernames, allowing punctuation and ignoring email addresses. */
export function extractMentionedUsernames(content: string): string[] {
  const mentions = content.matchAll(/(?:^|[^\w@])@(\w+)/g);
  return [...new Set(Array.from(mentions, (match) => match[1]))];
}
