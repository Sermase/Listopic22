import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AddReviewForm } from '../components/AddReviewForm';

const getRouteFallback = (placeId: string | null, listId: string | null) => {
    if (placeId) return `/place/${placeId}`;
    if (listId) return `/list/${listId}`;
    return '/';
};

export const CreateReviewPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const listId = searchParams.get('listId');
    const placeId = searchParams.get('placeId');
    const itemName = searchParams.get('itemName');
    const fallbackRoute = getRouteFallback(placeId, listId);

    return (
        <div className="min-h-screen bg-[#0b1021]">
            <AddReviewForm
                listId={listId}
                prefillPlaceId={placeId || undefined}
                prefillItemName={itemName || undefined}
                lockList={Boolean(listId)}
                onClose={() => navigate(fallbackRoute)}
                onSuccess={() => navigate(fallbackRoute)}
            />
        </div>
    );
};
