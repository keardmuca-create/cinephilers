export type { Actor, Review, Movie, SocialAction, SocialPost, Comment, User, BadgeInfo } from './types';
import type { Actor, Review, Movie, BadgeInfo, User, SocialPost } from './types';

export const MOCK_BADGES: BadgeInfo[] = [
  { id: 'b1', name: 'Early Adopter', description: 'Joined Cinephilers during beta.', requirement: 'Automatic', progress: 1, total: 1, color: 'from-blue-500 to-cyan-500' },
  { id: 'b2', name: 'Top Reviewer', description: 'Wrote high-quality reviews.', requirement: 'Write 10 reviews with 5+ likes.', progress: 7, total: 10, color: 'from-purple-500 to-pink-500' },
  { id: 'b3', name: 'Genre Guru', description: 'Explored various genres.', requirement: 'Watch movies from 12 different genres.', progress: 12, total: 12, color: 'from-amber-500 to-orange-500' },
  { id: 'b4', name: 'Marathoner', description: 'Binge-watched content.', requirement: 'Watch 5 movies in 24 hours.', progress: 2, total: 5, color: 'from-green-500 to-emerald-500' },
  { id: 'b5', name: 'Star Scorer', description: 'Active rater.', requirement: 'Rate 100 movies.', progress: 85, total: 100, color: 'from-yellow-400 to-amber-600' },
  { id: 'b6', name: 'Cinephile Elite', description: 'Watched over 500 films.', requirement: 'Watch 500 movies.', progress: 342, total: 500, color: 'from-indigo-500 to-blue-700' },
  { id: 'b7', name: 'Social Butterfly', description: 'Interact with community.', requirement: 'Comment on 50 posts.', progress: 12, total: 50, color: 'from-rose-400 to-red-600' },
];

const MOCK_CAST: Actor[] = [
  { id: '1', name: 'Julian Thorne', role: 'Protagonist', bio: 'Born in London, Julian started acting at 12 and rose to fame in indie dramas.', knownFor: ['Silence of Winds', 'The Echo'] },
  { id: '2', name: 'Elena Vance', role: 'Antagonist', bio: 'Elena is a classically trained actress known for her powerful vocal range.', knownFor: ['Neon Nights', 'Shattered'] },
  { id: '3', name: 'Marcus Flint', role: 'Supporting', bio: 'A veteran of the screen with over 40 years of experience in character acting.', knownFor: ['Old Dust', 'The Horizon'] },
];

const MOCK_REVIEWS: Review[] = [
  { id: 'r1', userId: 'u2', userName: 'MovieNerd99', userAvatar: 'https://picsum.photos/seed/user2/100/100', rating: 9.0, content: 'Absolutely breathtaking visuals. The narrative is a bit slow but the payoff is worth it.', date: '2 days ago', likes: 24 },
  { id: 'r2', userId: 'u3', userName: 'Cinema_Guru', userAvatar: 'https://picsum.photos/seed/user3/100/100', rating: 10, content: 'A masterpiece of modern storytelling. I haven\'t seen anything like this in years!', date: '1 week ago', likes: 156 },
  { id: 'r3', userId: 'u4', userName: 'CasualFan', userAvatar: 'https://picsum.photos/seed/user4/100/100', rating: 6.5, content: 'It was okay. A bit long for my taste but the acting was solid.', date: '3 hours ago', likes: 5 },
];

export const MOCK_MOVIES: Movie[] = [
  {
    id: 'm1',
    title: 'Neon Horizon',
    year: '2024',
    genre: 'Sci-Fi Action',
    description: 'In a rain-soaked futuristic city, a rogue detective discovers a secret that could dismantle the world\'s largest tech conglomerate.',
    rating: 8.7,
    followingsRating: 9.1,
    votes: 12540,
    poster: 'https://picsum.photos/seed/m1/400/600',
    backdrop: 'https://picsum.photos/seed/m1back/1200/600',
    director: 'Denis Villeneuve',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"The light only shows us what we want to see."', '"Time is the only currency left."'],
    trivia: ['The lead actor spent 3 months learning a fictional language.', 'Filmed entirely in 8K resolution.'],
    type: 'movie'
  },
  {
    id: 'm2',
    title: 'Silent Echoes',
    year: '2023',
    genre: 'Mystery Thriller',
    description: 'A secluded mountain town is rocked by a series of disappearances that mirror a cold case from thirty years ago.',
    rating: 7.9,
    followingsRating: 7.5,
    votes: 8200,
    poster: 'https://picsum.photos/seed/m2/400/600',
    backdrop: 'https://picsum.photos/seed/m2back/1200/600',
    director: 'Greta Gerwig',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"Some secrets are better left buried."', '"The mountains have ears."'],
    trivia: ['Real residents of the filming location were used as extras.'],
    type: 'movie'
  },
  {
    id: 'm3',
    title: 'The Last Kingdom',
    year: '2024',
    genre: 'Epic Fantasy',
    description: 'An unlikely group of heroes must journey across a fractured continent to reunite the seven crowns before the eternal winter arrives.',
    rating: 9.2,
    followingsRating: 8.8,
    votes: 45000,
    poster: 'https://picsum.photos/seed/m3/400/600',
    backdrop: 'https://picsum.photos/seed/m3back/1200/600',
    director: 'Peter Jackson',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"For the crown!"', '"Death is but a new beginning."'],
    trivia: ['The costumes weighed over 20kg each.'],
    type: 'show'
  },
  {
    id: 'm4',
    title: 'Starlight Avenue',
    year: '2024',
    genre: 'Musical Drama',
    description: 'Two aspiring musicians fall in love while navigating the competitive and cutthroat industry of modern pop music.',
    rating: 7.4,
    followingsRating: 8.0,
    votes: 5600,
    poster: 'https://picsum.photos/seed/m4/400/600',
    backdrop: 'https://picsum.photos/seed/m4back/1200/600',
    director: 'Damien Chazelle',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"Music is the only truth."', '"We\'re just stars looking for a sky."'],
    trivia: ['All songs were performed live on set.'],
    type: 'movie'
  },
  {
    id: 'm5',
    title: 'The Great Heist',
    year: '2024',
    genre: 'Crime Drama',
    description: 'A master thief is forced out of retirement for one final job: stealing the world\'s most protected diamond from a vault on the moon.',
    rating: 8.1,
    followingsRating: 7.9,
    votes: 18900,
    poster: 'https://picsum.photos/seed/m5/400/600',
    backdrop: 'https://picsum.photos/seed/m5back/1200/600',
    director: 'Christopher Nolan',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"The moon is our playground."', '"Nobody leaves empty handed."'],
    trivia: ['Consulted with NASA scientists for the low-gravity sequences.'],
    type: 'movie'
  },
  {
    id: 'm6',
    title: 'Echoes of War',
    year: '2023',
    genre: 'Historical Drama',
    description: 'A young nurse on the frontlines of WWII must choose between her duty and a forbidden love with an enemy soldier.',
    rating: 8.5,
    followingsRating: 8.2,
    votes: 32000,
    poster: 'https://picsum.photos/seed/m6/400/600',
    backdrop: 'https://picsum.photos/seed/m6back/1200/600',
    director: 'Steven Spielberg',
    cast: MOCK_CAST,
    reviews: MOCK_REVIEWS,
    quotes: ['"Love knows no borders."', '"The silence is louder than the bombs."'],
    trivia: ['Uses authentic archival footage from the period.'],
    type: 'movie'
  }
];

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Alex Cinephile',
  username: '@alex_cinema',
  avatar: 'https://picsum.photos/seed/u1/200/200',
  bio: 'Movies are my life. Sci-fi enthusiast and soundtrack collector. 🎬',
  followingCount: 245,
  followerCount: 1280,
  badges: ['Early Adopter', 'Top Reviewer', 'Genre Guru']
};

export const MOCK_SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'p1',
    userId: 'u2',
    userName: 'Sarah Jenkins',
    userAvatar: 'https://picsum.photos/seed/u2/100/100',
    action: 'rated',
    contentId: 'm1',
    contentTitle: 'Neon Horizon',
    rating: 9.5,
    review: 'Everything about this film screams masterpiece. Denis does it again!',
    timestamp: '2h ago',
    likes: ['u1', 'u3', 'u4'],
    comments: [
      { id: 'c1', userId: 'u1', userName: 'Alex Cinephile', content: 'Such a good movie! Totally deserved the 9.5.', timestamp: '1h ago' }
    ]
  },
  {
    id: 'p2',
    userId: 'u3',
    userName: 'David Miller',
    userAvatar: 'https://picsum.photos/seed/u3/100/100',
    action: 'reviewed',
    contentId: 'm3',
    contentTitle: 'The Last Kingdom',
    rating: 8.5,
    review: 'The cinematography in the third episode is mind-blowing. The way they captured the castle siege with those wide-angle lenses was pure brilliance. Can\'t wait for next week!',
    timestamp: '5h ago',
    likes: ['u1'],
    comments: []
  },
  {
    id: 'p3',
    userId: 'u4',
    userName: 'Emily Chen',
    userAvatar: 'https://picsum.photos/seed/u4/100/100',
    action: 'watchlist',
    contentId: 'm2',
    contentTitle: 'Silent Echoes',
    timestamp: '8h ago',
    likes: [],
    comments: []
  },
  {
    id: 'p4',
    userId: 'u1',
    userName: 'Alex Cinephile',
    userAvatar: 'https://picsum.photos/seed/u1/100/100',
    action: 'rewatched',
    contentId: 'm5',
    contentTitle: 'The Great Heist',
    rating: 10,
    review: 'Second time watching this and it hits even harder. The moon vault sequence is the peak of heist cinema.',
    timestamp: '1d ago',
    likes: ['u2', 'u3'],
    comments: []
  }
];

export const MOCK_FRIENDS: User[] = [
  { id: 'u2', name: 'Sarah Jenkins', username: '@s_jenkins', avatar: 'https://picsum.photos/seed/u2/100/100', bio: 'Horror fan 👻', followingCount: 100, followerCount: 200, badges: [] },
  { id: 'u3', name: 'David Miller', username: '@dmiller_films', avatar: 'https://picsum.photos/seed/u3/100/100', bio: 'Director in the making.', followingCount: 50, followerCount: 500, badges: [] },
  { id: 'u4', name: 'Emily Chen', username: '@echen_cinema', avatar: 'https://picsum.photos/seed/u4/100/100', bio: 'Korean drama specialist.', followingCount: 300, followerCount: 450, badges: [] },
  { id: 'u5', name: 'Michael Bay', username: '@explosions', avatar: 'https://picsum.photos/seed/u5/100/100', bio: 'Action is my middle name.', followingCount: 10, followerCount: 10000, badges: [] },
  { id: 'u6', name: 'Quentin T.', username: '@feet_expert', avatar: 'https://picsum.photos/seed/u6/100/100', bio: 'Dialogue over everything.', followingCount: 5, followerCount: 99999, badges: [] },
];
