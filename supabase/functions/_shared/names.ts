/** Game-name normalisation shared by the Edge Functions and the website (pure, no runtime APIs). */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(ps4|ps5|playstation ?[45]|xbox (one|series [xs]|series x\|s)|for windows 10|edition|remastered|trophies|pc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
