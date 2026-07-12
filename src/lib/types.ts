export interface Actor {
  id: string;
  name: string;
  role: string;
  profileImage?: string;
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

export interface Trailer {
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface TvEpisode {
  id: number;
  name: string;
  episode_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  vote_average: number;
  runtime: number | null;
}

export interface EpisodeDetail {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  runtime: number | null;
  cast: Actor[];
  guestStars: Actor[];
  crew: { name: string; job: string }[];
  stills: string[];
  trailers: Trailer[];
}

export interface TvSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string;
  overview: string;
  poster_path: string | null;
}

export interface CollectionItem {
  id: string;          // app id, e.g. tmdb-438631 — links to the movie page
  title: string;
  year: string;
  poster: string;
  releaseDate: string; // drives release-order sort and the upcoming check
  tmdbRating?: number; // TMDB vote average (0-10); absent when unrated/upcoming
  isCurrent: boolean;  // the film currently being viewed
}

export interface MovieCollection {
  id: number;
  name: string;        // e.g. "Dune Collection"
  parts: CollectionItem[];
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
  // Extended fields — only present on the detail page
  trailers?: Trailer[];
  images?: string[];
  runtime?: number;
  tagline?: string;
  status?: string;
  releaseDate?: string;
  budget?: number;
  revenue?: number;
  seasons?: TvSeason[];
  networks?: string[];
  episodeRuntime?: number;
  crew?: { id?: string; name: string; job: string }[];
  originalLanguage?: string;
  productionCompanies?: string[];
  totalEpisodes?: number;
  showType?: string;
  collection?: MovieCollection;  // movies only — other films in the same franchise
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
