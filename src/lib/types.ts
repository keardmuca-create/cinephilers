export interface Actor {
  id: string;
  name: string;
  role: string;
  bio: string;
  knownFor: string[];
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  content: string;
  date: string;
  likes: number;
}

export interface Movie {
  id: string;
  title: string;
  year: string;
  genre: string;
  description: string;
  rating: number;
  followingsRating: number;
  votes: number;
  poster: string;
  backdrop: string;
  director: string;
  cast: Actor[];
  reviews: Review[];
  quotes: string[];
  trivia: string[];
  type: 'movie' | 'show';
}

export type SocialAction = 'watched' | 'rated' | 'reviewed' | 'watchlist' | 'rewatched';

export interface SocialPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  action: SocialAction;
  contentId: string;
  contentTitle: string;
  rating?: number;
  review?: string;
  timestamp: string;
  likes: string[];
  comments: Comment[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  followingCount: number;
  followerCount: number;
  badges: string[];
}

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  requirement: string;
  progress: number;
  total: number;
  color: string;
}
