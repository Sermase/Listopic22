import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { getLevelInfo, normalizeEarnedBadgeIds, type LevelInfo } from '../utils/gamification';
import { LevelUpModal } from '../components/LevelUpModal';
import { AchievementToast } from '../components/AchievementToast';

interface BadgeNotification {
    id: string;
    name: string;
    emoji?: string;
    description?: string;
    xpReward?: number;
}

interface GamificationContextValue {
    /** Current level info — always up to date via onSnapshot */
    levelInfo: LevelInfo;
    /** Set of earned badge IDs */
    earnedBadgeIds: string[];
    /** Force-show the level up modal (e.g. for testing) */
    triggerLevelUp: (xpGained: number, previousLevel: number, trigger?: string) => void;
    /** Force-show a badge toast */
    triggerBadgeUnlocked: (badge: BadgeNotification) => void;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

// Persistent deduplication so notifications only ever show once per device
const SHOWN_BADGES_KEY = 'lp_shown_badges';
const SHOWN_LEVEL_KEY = 'lp_shown_level';

function getSessionShownBadges(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(SHOWN_BADGES_KEY) || '[]')); }
    catch { return new Set(); }
}
function markSessionBadgeShown(id: string) {
    try {
        const s = getSessionShownBadges(); s.add(id);
        localStorage.setItem(SHOWN_BADGES_KEY, JSON.stringify([...s]));
    } catch { /* ignore */ }
}
function getSessionShownLevel(): number {
    try { return parseInt(localStorage.getItem(SHOWN_LEVEL_KEY) || '0', 10); }
    catch { return 0; }
}
function markSessionLevelShown(level: number) {
    try { localStorage.setItem(SHOWN_LEVEL_KEY, String(level)); }
    catch { /* ignore */ }
}

export const useGamification = (): GamificationContextValue => {
    const ctx = useContext(GamificationContext);
    if (!ctx) throw new Error('useGamification must be used within GamificationProvider');
    return ctx;
};

export const GamificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();

    // Tracked state
    const [levelInfo, setLevelInfo] = useState<LevelInfo>(getLevelInfo(0));
    const [earnedBadgeIds, setEarnedBadgeIds] = useState<string[]>([]);

    // Modal state
    const [showLevelUpModal, setShowLevelUpModal] = useState(false);
    const [levelUpData, setLevelUpData] = useState<{
        xpGained: number;
        previousLevel: number;
        trigger?: string;
    }>({ xpGained: 0, previousLevel: 0 });

    // Badge toast state
    const [badgeQueue, setBadgeQueue] = useState<BadgeNotification[]>([]);
    const [activeBadge, setActiveBadge] = useState<BadgeNotification | null>(null);

    // Refs for detecting changes (don't trigger on initial load)
    const prevXpRef = useRef<number | null>(null);
    const prevLevelRef = useRef<number | null>(null);
    const prevBadgeIdsRef = useRef<Set<string> | null>(null);
    const isInitialLoadRef = useRef(true);

    // Real-time listener on user profile
    useEffect(() => {
        if (!user?.uid) {
            setLevelInfo(getLevelInfo(0));
            setEarnedBadgeIds([]);
            prevXpRef.current = null;
            prevLevelRef.current = null;
            prevBadgeIdsRef.current = null;
            isInitialLoadRef.current = true;
            return;
        }

        const unsub = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();

            const newLevelInfo = getLevelInfo(data.xp, data.level);
            const newBadges = normalizeEarnedBadgeIds(data.badges);

            setLevelInfo(newLevelInfo);
            setEarnedBadgeIds(newBadges);

            // Cache snapshots: silently update refs so the server snapshot
            // compares against the correct baseline, but never trigger visuals.
            if (snap.metadata.fromCache) {
                prevXpRef.current = newLevelInfo.xp;
                prevLevelRef.current = newLevelInfo.level;
                prevBadgeIdsRef.current = new Set(newBadges);
                return;
            }

            // First confirmed-from-server snapshot: treat as initial load baseline.
            if (isInitialLoadRef.current) {
                prevXpRef.current = newLevelInfo.xp;
                prevLevelRef.current = newLevelInfo.level;
                prevBadgeIdsRef.current = new Set(newBadges);
                isInitialLoadRef.current = false;
                return;
            }

            // Detect level up
            const prevLevel = prevLevelRef.current ?? newLevelInfo.level;
            const prevXp = prevXpRef.current ?? newLevelInfo.xp;
            if (newLevelInfo.level > prevLevel && newLevelInfo.level > getSessionShownLevel()) {
                markSessionLevelShown(newLevelInfo.level);
                setLevelUpData({
                    xpGained: newLevelInfo.xp - prevXp,
                    previousLevel: prevLevel,
                    trigger: '¡Subiste de nivel!',
                });
                setShowLevelUpModal(true);
            }

            // Detect new badges (skip ones already shown this session)
            const prevBadgeSet = prevBadgeIdsRef.current ?? new Set<string>();
            const sessionShown = getSessionShownBadges();
            const newBadgeEntries = newBadges.filter(id => !prevBadgeSet.has(id) && !sessionShown.has(id));

            if (newBadgeEntries.length > 0) {
                newBadgeEntries.forEach(markSessionBadgeShown);
                const notifications: BadgeNotification[] = newBadgeEntries.map(id => ({
                    id,
                    name: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    emoji: '🏆',
                }));
                setBadgeQueue(prev => [...prev, ...notifications]);
            }

            // Update refs
            prevXpRef.current = newLevelInfo.xp;
            prevLevelRef.current = newLevelInfo.level;
            prevBadgeIdsRef.current = new Set(newBadges);
        }, (error) => {
            console.warn('GamificationProvider: onSnapshot error', error);
        });

        return unsub;
    }, [user?.uid]);

    // Process badge queue — show one at a time
    useEffect(() => {
        if (activeBadge || badgeQueue.length === 0) return;
        const [next, ...rest] = badgeQueue;
        setActiveBadge(next);
        setBadgeQueue(rest);
    }, [badgeQueue, activeBadge]);

    const handleBadgeDismiss = useCallback(() => {
        setActiveBadge(null);
    }, []);

    const triggerLevelUp = useCallback((xpGained: number, previousLevel: number, trigger?: string) => {
        setLevelUpData({ xpGained, previousLevel, trigger });
        setShowLevelUpModal(true);
    }, []);

    const triggerBadgeUnlocked = useCallback((badge: BadgeNotification) => {
        setBadgeQueue(prev => [...prev, badge]);
    }, []);

    const value = useMemo<GamificationContextValue>(() => ({
        levelInfo,
        earnedBadgeIds,
        triggerLevelUp,
        triggerBadgeUnlocked,
    }), [levelInfo, earnedBadgeIds, triggerLevelUp, triggerBadgeUnlocked]);

    return (
        <GamificationContext.Provider value={value}>
            {children}

            <LevelUpModal
                isOpen={showLevelUpModal}
                onClose={() => setShowLevelUpModal(false)}
                levelInfo={levelInfo}
                previousLevel={levelUpData.previousLevel}
                xpGained={levelUpData.xpGained}
                trigger={levelUpData.trigger}
            />

            <AchievementToast
                isVisible={!!activeBadge}
                onDismiss={handleBadgeDismiss}
                badgeName={activeBadge?.name || ''}
                badgeEmoji={activeBadge?.emoji}
                badgeDescription={activeBadge?.description}
                xpReward={activeBadge?.xpReward}
            />
        </GamificationContext.Provider>
    );
};
