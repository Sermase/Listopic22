
import { Category, TopicList, UserProfile, FeedActivity } from './types';
import { Utensils, MapPin, Palette, Sparkles, Zap, Flame, Pizza, Medal, Crown, Glasses } from 'lucide-react';

export const CATEGORIES: Category[] = [
  { 
    id: 'all', 
    label: 'Todo', 
    description: 'Mix',
    icon: Sparkles, 
    color: 'text-slate-600',
    bg: 'bg-slate-100' 
  },
  { 
    id: 'hmm', 
    label: 'Hmm...', 
    description: 'Gastronomía & Sabor',
    icon: Utensils, 
    color: 'text-orange-600',
    bg: 'bg-orange-100' 
  },
  { 
    id: 'woow', 
    label: 'Woow!', 
    description: 'Lugares & Viajes',
    icon: MapPin, 
    color: 'text-teal-600',
    bg: 'bg-teal-100' 
  },
  { 
    id: 'aah', 
    label: 'Aah!', 
    description: 'Arte, Cine & Cultura',
    icon: Palette, 
    color: 'text-purple-600',
    bg: 'bg-purple-100' 
  },
];

// Mock Lists Data
export const MOCK_LISTS: TopicList[] = [
  {
    id: 1,
    title: "Best Burgers in NYC",
    emoji: "🍔",
    category: "hmm",
    author: "Felix The Cat",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    likes: 1240,
    views: 5400,
    createdAt: "2 days ago",
    criteria: [
      { id: 'c1', label: 'Juiciness', weight: 1 },
      { id: 'c2', label: 'Bun Texture', weight: 0.8 },
      { id: 'c3', label: 'Value', weight: 0.6 }
    ],
    items: [
      {
        id: 'i1',
        name: "Joe's Burger Joint",
        location: "West Village, NY",
        imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80",
        scores: { 'c1': 9.5, 'c2': 8.0, 'c3': 7.0 },
        totalScore: 8.8,
        tags: ['Classic', 'Cheap'],
        comment: "The grease is part of the charm. Best late night bite."
      },
      {
        id: 'i2',
        name: "The Fancy Cow",
        location: "Soho, NY",
        imageUrl: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=800&q=80",
        scores: { 'c1': 8.0, 'c2': 9.5, 'c3': 4.0 },
        totalScore: 7.9,
        tags: ['Gourmet', 'Date Night'],
        comment: "Amazing brioche bun, but $25 is a bit steep."
      }
    ]
  },
  {
    id: 2,
    title: "Marvel Phase 4 Ranked",
    emoji: "🦸‍♂️",
    category: "aah",
    author: "ComicNerd99",
    likes: 3400,
    views: 12000,
    createdAt: "1 week ago",
    criteria: [
      { id: 'c1', label: 'Story', weight: 1 },
      { id: 'c2', label: 'VFX', weight: 0.7 },
      { id: 'c3', label: 'Villain', weight: 0.9 }
    ],
    items: [
      {
        id: 'i1',
        name: "Spider-Man: No Way Home",
        imageUrl: "https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=800&q=80",
        scores: { 'c1': 9.8, 'c2': 9.0, 'c3': 9.5 },
        totalScore: 9.5,
        tags: ['Nostalgia', 'Emotional'],
        comment: "The theater reaction was unlike anything else."
      },
      {
        id: 'i2',
        name: "Shang-Chi",
        imageUrl: "https://images.unsplash.com/photo-1596727147705-54a9d1160fac?auto=format&fit=crop&w=800&q=80",
        scores: { 'c1': 8.5, 'c2': 9.5, 'c3': 8.0 },
        totalScore: 8.6,
        tags: ['Action', 'Martial Arts']
      }
    ]
  },
  {
    id: 3,
    title: "Kyoto Hidden Temples",
    emoji: "⛩️",
    category: "woow",
    author: "JapanLover",
    likes: 2100,
    views: 8900,
    createdAt: "3 days ago",
    criteria: [
      { id: 'c1', label: 'Atmosphere', weight: 1 },
      { id: 'c2', label: 'Crowds', weight: 0.9 },
      { id: 'c3', label: 'Gardens', weight: 0.8 }
    ],
    items: [
        {
            id: 'i1',
            name: "Ruriko-in",
            location: "Yase, Kyoto",
            imageUrl: "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=800&q=80",
            scores: { 'c1': 9.5, 'c2': 9.0, 'c3': 9.8 },
            totalScore: 9.4,
            tags: ['Autumn', 'Reflection']
        }
    ]
  },
];

export const MOCK_FEED: FeedActivity[] = [
  {
    id: 'f1',
    type: 'REVIEW',
    user: { name: 'Sofia Traveller', handle: '@sofia_go', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sofia' },
    timestamp: '2h ago',
    content: {
      placeName: 'Hidden Beach Cove',
      placeLocation: 'Mallorca, Spain',
      placeImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
      listTitle: 'Best Mediterranean Spots',
      emoji: '🏖️',
      rating: 9.8,
      comment: "Absolutely breathtaking water clarity. Hard to access but totally worth the hike.",
      scores: [{ label: 'Beauty', score: 10 }, { label: 'Access', score: 6 }, { label: 'Vibe', score: 9.5 }]
    },
    likes: 45,
    comments: 8
  },
  {
    id: 'f2',
    type: 'REVIEW',
    user: { name: 'Burger King', handle: '@burger_king_fan', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=King' },
    timestamp: '4h ago',
    content: {
      placeName: 'Smash House',
      placeLocation: 'Downtown, NY',
      placeImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
      listTitle: 'Sunday Cheats',
      emoji: '🍔',
      rating: 8.2,
      comment: "Solid smash burger. The edges were crispy but the sauce was a bit too sweet for me.",
      scores: [{ label: 'Crisp', score: 9 }, { label: 'Juice', score: 8 }, { label: 'Price', score: 7 }]
    },
    likes: 12,
    comments: 2
  }
];

// User Specific Mocks
const MY_REVIEWS: FeedActivity[] = [
    {
        id: 'my_r1',
        type: 'REVIEW',
        user: { name: 'Felix The Cat', handle: '@felix_ranks', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
        timestamp: '2 days ago',
        content: {
          placeName: 'Joe\'s Burger Joint',
          placeLocation: 'West Village, NY',
          placeImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
          listTitle: 'Best Burgers in NYC',
          emoji: '🍔',
          rating: 8.8,
          comment: "The grease is part of the charm. Best late night bite.",
          scores: [{ label: 'Juiciness', score: 9.5 }, { label: 'Bun', score: 8 }]
        },
        likes: 24,
        comments: 5
    },
    {
        id: 'my_r2',
        type: 'REVIEW',
        user: { name: 'Felix The Cat', handle: '@felix_ranks', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
        timestamp: '1 week ago',
        content: {
          placeName: 'Dune: Part Two',
          placeLocation: 'IMAX Theater',
          placeImage: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?auto=format&fit=crop&w=800&q=80',
          listTitle: 'Sci-Fi Masterpieces',
          emoji: '🎬',
          rating: 10,
          comment: "A cinematic religious experience. The sound design shook my very soul.",
          scores: [{ label: 'Visuals', score: 10 }, { label: 'Sound', score: 10 }]
        },
        likes: 156,
        comments: 42
    }
];

export const MOCK_USER: UserProfile = {
  name: "Felix The Cat",
  handle: "@felix_ranks",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  bio: "Searching for the perfect burger and the ultimate sunset. 🍔🌅 | LVL 7 Curator",
  level: 7,
  xp: 2400,
  maxXp: 3500,
  rankTitle: "Taste Hunter",
  followers: 1205,
  following: 84,
  listsCreatedCount: 12,
  itemsRankedCount: 85,
  badges: [
    { id: 'b1', name: 'Early Adopter', icon: Zap, color: 'text-yellow-500', description: 'Joined in 2025', unlockedAt: 'Jan 2025' },
    { id: 'b2', name: 'Trendsetter', icon: Flame, color: 'text-orange-500', description: 'List reached top 10', unlockedAt: 'Feb 2025' },
    { id: 'b3', name: 'Pizza Critic', icon: Pizza, color: 'text-red-500', description: 'Ranked 10+ Pizzas', unlockedAt: 'Mar 2025' },
    { id: 'b4', name: 'Explorer', icon: MapPin, color: 'text-blue-500', description: 'Created a Travel list', unlockedAt: 'Apr 2025' },
    { id: 'b5', name: 'Elite', icon: Crown, color: 'text-purple-500', description: 'Reached Level 5' },
    { id: 'b6', name: 'Cinephile', icon: Glasses, color: 'text-teal-500', description: 'Reviewed 20 Movies' },
  ],
  myLists: [MOCK_LISTS[0]], // Felix owns the Burger list
  myReviews: MY_REVIEWS
};
