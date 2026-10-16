/**
 * Celebrity Gender Guard & Anti-Dead-Giveaway Exception Handler
 *
 * Ensures that 4-option face-match quizzes (Photo 2 and Reel 2) NEVER mix
 * male and female celebrities, eliminating obvious "only woman" or "only man"
 * giveaways for viewers.
 */

const https = require('https');
const TMDB_API_KEY = process.env.TMDB_API_KEY || '09ad47354cf2588cd01875ba6e225d07';

const HOLLYWOOD_FEMALE_POOL = [
  'Meryl Streep', 'Julia Roberts', 'Jennifer Aniston', 'Sandra Bullock',
  'Scarlett Johansson', 'Emma Stone', 'Anne Hathaway', 'Cate Blanchett',
  'Nicole Kidman', 'Charlize Theron', 'Kate Winslet', 'Reese Witherspoon',
  'Angelina Jolie', 'Halle Berry', 'Salma Hayek', 'Natalie Portman',
  'Diane Keaton', 'Goldie Hawn', 'Susan Sarandon', 'Sigourney Weaver',
  'Glenn Close', 'Jane Fonda', 'Helen Mirren', 'Jamie Lee Curtis',
  'Michelle Pfeiffer', 'Jessica Lange', 'Sally Field', 'Meg Ryan',
  'Winona Ryder', 'Drew Barrymore', 'Courteney Cox', 'Lisa Kudrow',
  'Catherine Zeta-Jones', 'Cameron Diaz', 'Penelope Cruz', 'Joyce DeWitt',
  'Farrah Fawcett', 'Demi Moore', 'Laura Dern', 'Geena Davis',
  'Julianne Moore', 'Jodie Foster', 'Uma Thurman', 'Viola Davis', 'Amy Adams',
  'Marisa Tomei', 'Angela Bassett', 'Helena Bonham Carter', 'Judi Dench', 'Maggie Smith'
];

const HOLLYWOOD_MALE_POOL = [
  'Tom Hanks', 'Harrison Ford', 'Robert De Niro', 'Al Pacino',
  'Morgan Freeman', 'Clint Eastwood', 'Denzel Washington', 'Brad Pitt',
  'Leonardo DiCaprio', 'George Clooney', 'Johnny Depp', 'Tom Cruise',
  'Samuel L. Jackson', 'Matt Damon', 'Will Smith', 'Keanu Reeves',
  'Christian Bale', 'Robert Downey Jr.', 'Anthony Hopkins', 'Michael Caine',
  'Jack Nicholson', 'Dustin Hoffman', 'Gene Hackman', 'Jeff Bridges',
  'Kurt Russell', 'Sam Elliott', 'Robert Duvall', 'Tommy Lee Jones',
  'Christopher Walken', 'Kevin Costner', 'Pierce Brosnan', 'Mel Gibson',
  'Liam Neeson', 'Bill Murray', 'Woody Harrelson', 'Michael Douglas',
  'Gary Oldman', 'Russell Crowe', 'Willem Dafoe', 'Bryan Cranston', 'Nicolas Cage',
  'Hugh Jackman', 'Christian Slater', 'Dennis Quaid', 'Alec Baldwin', 'John Malkovich'
];

function isKnownGender(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (HOLLYWOOD_FEMALE_POOL.some(f => f.toLowerCase() === n)) return 'female';
  if (HOLLYWOOD_MALE_POOL.some(m => m.toLowerCase() === n)) return 'male';
  return null;
}

function fetchTmdbGender(name) {
  return new Promise(resolve => {
    const url = 'https://api.themoviedb.org/3/search/person?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(name);
    https.get(url, { headers: { 'User-Agent': 'BornTodayHollywood/1.0' }, timeout: 5000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const g = j.results && j.results[0] ? j.results[0].gender : 0;
          if (g === 1) return resolve('female');
          if (g === 2) return resolve('male');
          resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function detectGender(name, fallbackGender = 'male') {
  const known = isKnownGender(name);
  if (known) return known;
  try {
    const tmdbG = await fetchTmdbGender(name);
    if (tmdbG) return tmdbG;
  } catch(e) {}
  return (fallbackGender || 'male').toLowerCase();
}

function getRandomSameGenderDistractors(targetGender, excludeNames = [], count = 3) {
  const normGender = (targetGender || 'male').toLowerCase() === 'female' ? 'female' : 'male';
  const pool = normGender === 'female' ? HOLLYWOOD_FEMALE_POOL : HOLLYWOOD_MALE_POOL;
  const excludeLower = excludeNames.map(n => (n || '').toLowerCase());
  const filtered = pool.filter(n => !excludeLower.includes(n.toLowerCase()));
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Audits a quiz post and enforces that ALL 4 options match the target celebrity's gender.
 * If mixed genders are detected, the exception handler fires and replaces distractors.
 */
async function auditAndEnforceQuizGender(quizPost) {
  if (!quizPost) return { modified: false, post: quizPost };

  const targetName = quizPost.celebrity_name || '';
  let targetGender = (quizPost.gender || '').toLowerCase();
  if (targetGender !== 'female' && targetGender !== 'male') {
    targetGender = await detectGender(targetName, 'male');
    quizPost.gender = targetGender;
  }

  const options = Array.isArray(quizPost.options) ? quizPost.options : [];
  const correctLetter = quizPost.correct_option || 'A';

  // Audit existing distractors
  let hasGenderMismatch = false;
  if (options.length !== 4) {
    hasGenderMismatch = true;
  } else {
    for (const opt of options) {
      if (opt.letter === correctLetter) continue; // target is allowed
      const g = await detectGender(opt.name, null);
      if (g && g !== targetGender) {
        hasGenderMismatch = true;
        console.log('   [!] Gender mismatch detected: Option ' + opt.letter + ' (' + opt.name + ') is ' + g + ', but target ' + targetName + ' is ' + targetGender + '.');
        break;
      }
    }
  }

  if (!hasGenderMismatch) {
    return { modified: false, post: quizPost };
  }

  // EXCEPTION HANDLER ACTIVATION:
  console.log('   [🛡️ GENDER GUARD EXCEPTION HANDLER] Triggered for "' + targetName + '" (' + targetGender + '). Replacing options with verified same-gender Hollywood icons...');
  const newDistractors = getRandomSameGenderDistractors(targetGender, [targetName], 3);
  let distIdx = 0;

  const letters = ['A', 'B', 'C', 'D'];
  const newOptions = letters.map(letter => {
    if (letter === correctLetter) {
      return { letter, name: targetName };
    }
    const distName = newDistractors[distIdx++];
    return { letter, name: distName };
  });

  quizPost.options = newOptions;

  // Update caption distractor breakdown if it mentions other photos
  if (quizPost.caption) {
    const distractorList = newOptions
      .filter(o => o.letter !== correctLetter)
      .map(o => 'Photo ' + o.letter + ': ' + o.name)
      .join(', ');
    
    // Replace old '(Photo B: ..., Photo C: ...)' patterns
    quizPost.caption = quizPost.caption.replace(/\(Photo [A-D]: [^)]+\)/g, '(' + distractorList + ')');
    // Also replace old '(A: ..., B: ..., C: ..., D: ...)' patterns
    const allList = newOptions.map(o => o.letter + ': ' + o.name).join(', ');
    quizPost.caption = quizPost.caption.replace(/\([A-D]: [^)]+\)/g, '(' + allList + ')');
  }

  return { modified: true, post: quizPost, newOptions };
}

module.exports = {
  HOLLYWOOD_FEMALE_POOL,
  HOLLYWOOD_MALE_POOL,
  detectGender,
  getRandomSameGenderDistractors,
  auditAndEnforceQuizGender
};
