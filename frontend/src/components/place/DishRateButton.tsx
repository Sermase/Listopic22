import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAuthPrompt } from '../../context/AuthPromptContext';
import { cn } from '../../lib/utils';
import { dishReviewUrl } from './dishReviewUrl';

interface DishRateButtonProps {
    placeId: string;
    itemName: string;
    listId?: string | null;
    className?: string;
}

/**
 * Botoncito «+» de cada fila de la carta: abre la valoración de ESE plato con
 * los datos fijados. Va fuera del enlace de la fila (hit area propia) y para
 * la propagación por si acaso.
 */
export const DishRateButton: React.FC<DishRateButtonProps> = ({ placeId, itemName, listId, className }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
            openAuthPrompt('valorar este plato');
            return;
        }
        navigate(dishReviewUrl(placeId, itemName, listId));
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={`Valorar ${itemName}`}
            title={`Valorar ${itemName}`}
            className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] transition-all hover:scale-105 hover:border-[var(--lt-accent)] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lt-accent)]',
                className,
            )}
        >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
    );
};
