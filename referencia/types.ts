
import { LucideIcon } from 'lucide-react';

export interface Criterion {
  id: string;
  label: string;
  weight: number; // 1-10 importance
}

export interface ListItem {
  id: string;
  name: string;
  location?: string; // Google Places Address
  imageUrl?: string;
  scores: Record<string, number>; // criterionId -> score (1-10)
  totalScore: number; // Calculated average
  tags?: string[];
  comment?: string;
}

export interface TopicList {
  id: number;
  title: string;
  emoji: string;
  category: 'hmm' | 'woow' | 'aah' | 'other'; // Updated categories
  author: string;
  authorAvatar?: string;
  items: ListItem[];
  criteria: Criterion[];
  likes: number;
  views: number;
  createdAt: string;
}

export interface FeedActivity {
  id: string;
  type: 'REVIEW' | 'LIST_CREATED';
  user: {
    name: string;
    avatar: string;
    handle: string;
  };
  timestamp: string;
  content: {
    placeName: string;
    placeLocation?: string;
    placeImage: string;
    listTitle: string;
    emoji: string;
    rating: number;
    comment: string;
    scores: { label: string; score: number }[]; // Top 3 scores to show
  };
  likes: number;
  comments: number;
}

export interface Category {
  id: string;
  label: string;
  description: string;
  icon: any; // Lucide icon component
  color: string;
  bg: string;
}

export interface Badge {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  description: string;
  unlockedAt?: string;
}

export interface UserProfile {
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  
  // Gamification
  level: number;
  xp: number;
  maxXp: number;
  rankTitle: string; // e.g. "Taste Hunter"
  
  // Social
  followers: number;
  following: number;
  
  // Stats
  listsCreatedCount: number;
  itemsRankedCount: number;
  
  badges: Badge[];
  
  // Content (References or full objects for this demo)
  myLists: TopicList[];
  myReviews: FeedActivity[];
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type ViewState = 'HOME' | 'PROFILE' | 'LIST_DETAIL' | 'CREATE';
