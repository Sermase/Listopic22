export const getSelectedProfileReviewListId = (filterValue: string): string | undefined => {
    const normalized = filterValue.trim();
    return normalized && normalized !== 'all' ? normalized : undefined;
};

export const selectProfileReviewResults = <T extends { listId?: string }>(
    filterValue: string,
    baseReviews: T[],
    queriedListReviews: T[],
): T[] => {
    const selectedListId = getSelectedProfileReviewListId(filterValue);
    if (!selectedListId) return baseReviews;
    return queriedListReviews.filter((review) => review.listId === selectedListId);
};
