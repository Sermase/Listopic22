import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { arrayUnion, doc, onSnapshot, updateDoc } from 'firebase/firestore';
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

    // Tracks whether the first server snapshot has been processed
    const isInitialLoadRef = useRef(true);
    const prevXpRef = useRef<number>(0);

    // Real-time listener on user profile
    useEffect(() => {
        if (!user?.uid) {
            setLevelInfo(getLevelInfo(0));
            setEarnedBadgeIds([]);
            isInitialLoadRef.current = true;
            return;
        }

        const userRef = doc(db, 'users', user.uid);

        const unsub = onSnapshot(userRef, { includeMetadataChanges: true }, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();

            const newLevelInfo = getLevelInfo(data.xp, data.level);
            const newBadges = normalizeEarnedBadgeIds(data.badges);

            setLevelInfo(newLevelInfo);
            setEarnedBadgeIds(newBadges);

            // Skip cache snapshots and pending-write confirmations silently
            if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;

            // Firestore-persisted notification state (survives reinstalls)
            const notifiedLevel: number = data.notifiedLevel ?? 0;
            const notifiedBadgeSet = new Set<string>(data.notifiedBadges ?? []);

            if (isInitialLoadRef.current) {
                // First server snapshot: silently bring Firestore notification state up to date
                // so old notifications never replay on app restart or reinstall.
                isInitialLoadRef.current = false;

                const updates: Record<string, unknown> = {};
                if (newLevelInfo.level > notifiedLevel) {
                    updates.notifiedLevel = newLevelInfo.level;
                }
                const unseenBadges = newBadges.filter(id => !notifiedBadgeSet.has(id));
                if (unseenBadges.length > 0) {
                    updates.notifiedBadges = arrayUnion(...unseenBadges);
                }
                if (Object.keys(updates).length > 0) {
                    updateDoc(userRef, updates).catch(() => { /* ignore */ });
                }
                prevXpRef.current = newLevelInfo.xp;
                return;
            }

            // In-session: show level-up notification only if Firestore hasn't recorded it yet
            if (newLevelInfo.level > notifiedLevel) {
                updateDoc(userRef, { notifiedLevel: newLevelInfo.level }).catch(() => { /* ignore */ });
                setLevelUpData({
                    xpGained: newLevelInfo.xp - prevXpRef.current,
                    previousLevel: notifiedLevel,
                    trigger: '¡Subiste de nivel!',
                });
                setShowLevelUpModal(true);
            }
            prevXpRef.current = newLevelInfo.xp;

            // In-session: show badge notifications for badges not yet recorded in Firestore
            const newBadgeEntries = newBadges.filter(id => !notifiedBadgeSet.has(id));
            if (newBadgeEntries.length > 0) {
                updateDoc(userRef, { notifiedBadges: arrayUnion(...newBadgeEntries) }).catch(() => { /* ignore */ });
                const notifications: BadgeNotification[] = newBadgeEntries.map(id => ({
                    id,
                    name: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    emoji: '🏆',
                }));
                setBadgeQueue(prev => [...prev, ...notifications]);
            }
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
