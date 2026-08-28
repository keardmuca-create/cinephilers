// Build a synthetic Letterboxd export, including the cases a real one contains
// that a tidy fixture would not: a comma in a title, an accented title, a
// half-star rating, a film watched three times, and a review with a line break
// in the middle of it.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const watched = `Date,Name,Year,Letterboxd URI
2025-01-14,Parasite,2019,https://boxd.it/a
2025-02-02,"Monsieur Hulot's Holiday, Part Two",1953,https://boxd.it/b
2025-03-09,Amélie,2001,https://boxd.it/c
2025-04-01,Spirited Away,2001,https://boxd.it/d
2025-05-05,Se7en,1995,https://boxd.it/e
2025-06-06,A Film That Does Not Exist Anywhere,1899,https://boxd.it/f
2025-07-07,Come and See,,https://boxd.it/g
`;

// Three viewings of one film — the middle column is what makes it a rewatch.
const diary = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2025-01-14,Parasite,2019,https://boxd.it/a,4.5,,,2025-01-14
2025-06-20,Parasite,2019,https://boxd.it/a,5,Yes,,2025-06-20
2025-08-01,Parasite,2019,https://boxd.it/a,5,Yes,,2025-08-01
2025-05-05,Se7en,1995,https://boxd.it/e,4,,,2025-05-05
`;

const ratings = `Date,Name,Year,Letterboxd URI,Rating
2025-01-14,Parasite,2019,https://boxd.it/a,4.5
2025-03-09,Amélie,2001,https://boxd.it/c,2.5
2025-04-01,Spirited Away,2001,https://boxd.it/d,5
2025-05-05,Se7en,1995,https://boxd.it/e,4
`;

const watchlist = `Date,Name,Year,Letterboxd URI
2025-08-10,The Godfather,1972,https://boxd.it/h
2025-08-11,Chernobyl,2019,https://boxd.it/i
`;

// The second review deliberately contains a newline inside its quoted field —
// which is legal CSV, and exactly what Letterboxd writes for a paragraph break.
const reviews = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Watched Date
2025-01-14,Parasite,2019,https://boxd.it/a,4.5,,"A staircase movie. Every floor is a class.",2025-01-14
2025-04-01,Spirited Away,2001,https://boxd.it/d,5,,"First paragraph about the bathhouse.

Second paragraph, after a blank line.",2025-04-01
2025-05-05,Se7en,1995,https://boxd.it/e,4,,"Quoted ""dialogue"" inside a review, plus a comma.",2025-05-05
`;

async function main() {
  const zip = new JSZip();
  zip.file('watched.csv', watched);
  zip.file('diary.csv', diary);
  zip.file('ratings.csv', ratings);
  zip.file('watchlist.csv', watchlist);
  zip.file('reviews.csv', reviews);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.resolve(process.cwd(), 'scripts/e2e/letterboxd-sample.zip');
  fs.writeFileSync(out, buf);
  console.log(`${out}  (${buf.length} bytes)`);
  console.log('base64 length: ' + buf.toString('base64').length);
  fs.writeFileSync(out + '.b64', buf.toString('base64'));
}

main().catch(e => { console.error(e); process.exit(1); });
