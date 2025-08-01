// public/js/components.js

window.ListopicApp = window.ListopicApp || {};
ListopicApp.components = (() => {

    /**
     * Genera el HTML para una tarjeta de reseña "instagrameable".
     * @param {object} item - El objeto de la reseña con datos enriquecidos.
     * @returns {string} El HTML de la tarjeta.
     */
    function createReviewSuperCard(item) {
        const uiUtils = ListopicApp.uiUtils;

        // Datos con valores por defecto para evitar errores si algo no viene
        const author = item.author || { id: '#', photoUrl: 'img/placeholder-avatar.png', name: 'Usuario Anónimo' };
        const place = item.place || { id: '#', name: 'Lugar no especificado', googleMapsUrl: '#' };
        const list = item.list || { id: '#', name: 'Lista no especificada' };

        // Generamos las barras de criterios
        let criteriaBarsHtml = '';
        if (item.criteriaRatings && Object.keys(item.criteriaRatings).length > 0) {
            criteriaBarsHtml = Object.entries(item.criteriaRatings).slice(0, 4).map(([criteria, rating]) => `
                <div class="criteria-bar">
                    <span class="criteria-bar__label">${uiUtils.escapeHtml(criteria)}</span>
                    <div class="criteria-bar__viz">
                        <div class="criteria-bar__bg">
                            <div class="criteria-bar__fill" style="width: ${rating * 10}%; background-color: ${getRatingColor(rating)};"></div>
                        </div>
                        <span class="criteria-bar__value" style="color: ${getRatingColor(rating)};">${rating.toFixed(1)}</span>
                    </div>
                </div>
            `).join('');
        }

        return `
        <div class="review-super-card" onclick="window.location.href='detail-view.html?listId=${item.listId}&id=${item.id}'">
            <div class="review-super-card__header">
                <div class="super-card-meta">
                    <a href="profile.html?userId=${author.id}" class="author-link" onclick="event.stopPropagation()">
                        <img src="${uiUtils.escapeHtml(author.photoUrl)}" alt="Avatar de ${uiUtils.escapeHtml(author.name)}" class="author-avatar">
                        <span class="author-name">${uiUtils.escapeHtml(author.name)}</span>
                    </a>
                    
                    <div class="place-info">
                        <span class="meta-separator">•</span>
                        <a href="place-detail.html?placeId=${place.id}" class="place-name-link" onclick="event.stopPropagation()">${uiUtils.escapeHtml(place.name)}</a>
                        ${place.googleMapsUrl && place.googleMapsUrl !== '#' ? `
                            <a href="${uiUtils.escapeHtml(place.googleMapsUrl)}" target="_blank" class="gmaps-link" onclick="event.stopPropagation()" title="Ver en Google Maps">
                                <i class="fas fa-map-marker-alt"></i>
                            </a>` : ''}
                    </div>
                </div>
                <div class="list-highlight">
                    en la lista <a href="list-view.html?listId=${list.id}" onclick="event.stopPropagation()">${uiUtils.escapeHtml(list.name)}</a>
                </div>
            </div>

            <div class="review-super-card__body">
                ${item.thumbnailUrl ? `<div class="review-super-card__image-container">
                                        <img src="${uiUtils.escapeHtml(item.thumbnailUrl)}" class="review-super-card__image" alt="Foto de ${uiUtils.escapeHtml(item.itemName || '')}">
                                      </div>` : ''}
                <div class="review-super-card__main-content">
                    <h3 class="review-super-card__title">${uiUtils.escapeHtml(item.itemName || 'Reseña')}</h3>
                    <div class="criteria-bars-list">${criteriaBarsHtml}</div>
                </div>
            </div>
            
            <div class="review-super-card__footer">
                 <div class="overall-score-display">
                    <span class="score-value">${(item.overallRating || 0).toFixed(1)}</span>
                    <span class="score-label">General</span>
                 </div>
                 ${item.userTags && item.userTags.length > 0 ? `
                    <div class="tags-preview">
                        ${item.userTags.slice(0, 2).map(tag => `<span class="tag-pill">${uiUtils.escapeHtml(tag)}</span>`).join('')}
                        ${item.userTags.length > 2 ? `<span class="tag-pill">+${item.userTags.length - 2}</span>` : ''}
                    </div>` : ''}
            </div>
        </div>
        `;
    }
    
    // Función auxiliar para colorear las barras y números
    function getRatingColor(rating) {
        if (rating >= 8) return 'var(--accent-color-tertiary, #06D6A0)'; // Verde
        if (rating >= 6) return 'var(--accent-color-quinary, #FFD166)'; // Amarillo
        if (rating >= 4) return 'var(--accent-color-secondary, #f56ead)'; // Naranja/Rosa
        return 'var(--danger-color, #D9534F)'; // Rojo
    }

    // Hacemos la función accesible globalmente dentro de nuestro namespace
    return {
        createReviewSuperCard
    };

})();