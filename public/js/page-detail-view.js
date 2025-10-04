window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    function init() {
        console.log('Initializing Detail View page logic...');

        const auth = ListopicApp.services.auth;
        const db = ListopicApp.services.db;
        const state = ListopicApp.state;
        const uiUtils = ListopicApp.uiUtils;

        const params = new URLSearchParams(window.location.search);
        const reviewId = params.get('id');
        const listIdFromURL = params.get('listId');

        // Elementos del DOM
        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name');
        const detailItemNameEl = document.getElementById('detail-dish-name');
        const reviewAuthorNameEl = document.getElementById('review-author-name'); // <<--- ASEGÚRATE QUE ESTE ID ESTÉ EN TU HTML
        const detailImageEl = document.getElementById('detail-image');
        const detailScoreValueEl = document.getElementById('detail-score-value');
        const detailRatingsListEl = document.getElementById('detail-ratings');
        const detailLocationLinkEl = document.getElementById('detail-location-link');
        const detailLocationTextEl = document.getElementById('detail-location-text');
        const detailNoLocationDivEl = document.querySelector('.detail-no-location');
        const detailLocationContainerEl = document.getElementById('detail-location-container');
        const detailCommentContainerEl = document.getElementById('detail-comment-container');
        const detailCommentTextEl = document.getElementById('detail-comment-text');
        const detailTagsContainerEl = document.getElementById('detail-tags-container');
        const detailTagsDivEl = document.getElementById('detail-tags');
        const detailListNameEl = document.getElementById('detail-list-name');

        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button');
        const deleteButton = document.querySelector('.delete-button.danger');
        const shareButton = document.getElementById('share-instagram-button');
        const shareHelperEl = document.getElementById('share-instagram-helper');
        const shareStatusEl = document.getElementById('share-instagram-status');
        const shareDownloadLink = document.getElementById('share-instagram-download-link');
        const shareButtonOriginalHTML = shareButton ? shareButton.innerHTML : '';
        const showNotification = ListopicApp.services?.showNotification;

        let shareAssetsReady = false;
        const shareContext = { review: null, list: null, place: null };

        function setShareStatus(message, type = 'info') {
            if (!shareStatusEl) return;
            if (!message) {
                shareStatusEl.hidden = true;
                shareStatusEl.textContent = '';
                shareStatusEl.className = 'share-status-message';
                return;
            }
            shareStatusEl.hidden = false;
            shareStatusEl.textContent = message;
            shareStatusEl.className = `share-status-message ${type}`;
        }

        function toggleShareLoading(isLoading) {
            if (!shareButton) return;
            if (isLoading) {
                shareButton.setAttribute('data-loading', 'true');
                shareButton.setAttribute('aria-busy', 'true');
                shareButton.disabled = true;
                shareButton.innerHTML = '<i class="fas fa-spinner"></i> Generando…';
            } else {
                shareButton.removeAttribute('data-loading');
                shareButton.removeAttribute('aria-busy');
                shareButton.disabled = !shareAssetsReady;
                shareButton.innerHTML = shareButtonOriginalHTML;
            }
        }

        function enableShareFeature() {
            if (!shareButton || shareAssetsReady === true) return;
            shareAssetsReady = true;
            shareButton.disabled = false;
            shareButton.removeAttribute('aria-busy');
            if (shareHelperEl) shareHelperEl.hidden = false;
            setShareStatus('Genera una tarjeta lista para publicar en Instagram Stories.', 'info');
        }

        function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
            if (!text) return y;
            const words = String(text).split(/\s+/).filter(Boolean);
            let line = '';
            let currentY = y;
            for (const word of words) {
                const testLine = line ? `${line} ${word}` : word;
                if (ctx.measureText(testLine).width > maxWidth && line) {
                    ctx.fillText(line, x, currentY);
                    line = word;
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            if (line) {
                ctx.fillText(line, x, currentY);
                currentY += lineHeight;
            }
            return currentY;
        }

        function drawRoundedRectPath(ctx, x, y, width, height, radius) {
            const cornerRadius = Math.min(radius, width / 2, height / 2);
            ctx.beginPath();
            ctx.moveTo(x + cornerRadius, y);
            ctx.lineTo(x + width - cornerRadius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
            ctx.lineTo(x + width, y + height - cornerRadius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
            ctx.lineTo(x + cornerRadius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
            ctx.lineTo(x, y + cornerRadius);
            ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
            ctx.closePath();
        }

        function drawRoundedImage(ctx, img, x, y, width, height, radius) {
            drawRoundedRectPath(ctx, x, y, width, height, radius);
            ctx.save();
            ctx.clip();
            ctx.drawImage(img, x, y, width, height);
            ctx.restore();
        }

        async function loadImageSafely(url) {
            if (!url) throw new Error('URL no disponible');
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            return await new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
                img.src = url;
            });
        }

        async function createInstagramStoryCard(context, criteriaDefinitions = {}) {
            const { review, list, place } = context;
            const canvas = document.createElement('canvas');
            const width = 1080;
            const height = 1920;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#0f172a');
            gradient.addColorStop(1, '#1f2937');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.globalAlpha = 0.08;
            for (let i = -width; i < width * 2; i += 180) {
                ctx.beginPath();
                ctx.ellipse(i, height * 0.3, 220, 80, Math.PI / 6, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
            ctx.restore();

            const margin = 96;
            const availableWidth = width - margin * 2;

            const dishName = (review?.itemName || 'Mi reseña favorita').toString();
            const placeName = (place?.name || review?.establishmentName || 'Lugar especial').toString();
            const listName = (list?.name || 'Mi ranking personal').toString();
            const overallRating = Number.parseFloat(review?.overallRating ?? review?.overallScore ?? 0) || 0;

            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '500 36px "Poppins", "Helvetica Neue", Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(listName, margin, 120);

            ctx.fillStyle = '#ffffff';
            ctx.font = '700 68px "Poppins", "Helvetica Neue", Arial';
            let currentY = wrapText(ctx, dishName, margin, 180, availableWidth, 82);

            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '500 46px "Poppins", "Helvetica Neue", Arial';
            currentY = wrapText(ctx, placeName, margin, currentY + 10, availableWidth, 60);

            const imageHeight = 680;
            const imageWidth = availableWidth;
            const imageY = currentY + 20;
            let imageDrawn = false;
            if (review?.photoUrl) {
                try {
                    const img = await loadImageSafely(review.photoUrl);
                    const scale = Math.min(imageWidth / img.width, imageHeight / img.height);
                    const drawWidth = img.width * scale;
                    const drawHeight = img.height * scale;
                    const offsetX = margin + (imageWidth - drawWidth) / 2;
                    const offsetY = imageY + (imageHeight - drawHeight) / 2;
                    drawRoundedImage(ctx, img, offsetX, offsetY, drawWidth, drawHeight, 42);
                    imageDrawn = true;
                } catch (error) {
                    console.warn('No se pudo cargar la imagen de la reseña para la tarjeta.', error);
                }
            }

            if (!imageDrawn) {
                ctx.save();
                drawRoundedRectPath(ctx, margin, imageY, imageWidth, imageHeight, 42);
                ctx.clip();
                const fallbackGradient = ctx.createLinearGradient(margin, imageY, margin + imageWidth, imageY + imageHeight);
                fallbackGradient.addColorStop(0, '#dd2a7b');
                fallbackGradient.addColorStop(1, '#515bd4');
                ctx.fillStyle = fallbackGradient;
                ctx.fillRect(margin, imageY, imageWidth, imageHeight);
                ctx.restore();
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.font = '600 48px "Poppins", "Helvetica Neue", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.translate(width / 2, imageY + imageHeight / 2);
                ctx.rotate(-Math.PI / 9);
                ctx.fillText('LISTOPIC', 0, 0);
                ctx.restore();
            }

            ctx.save();
            drawRoundedRectPath(ctx, margin, imageY, imageWidth, imageHeight, 42);
            ctx.clip();
            const overlayGradient = ctx.createLinearGradient(0, imageY, 0, imageY + imageHeight);
            overlayGradient.addColorStop(0, 'rgba(0,0,0,0)');
            overlayGradient.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = overlayGradient;
            ctx.fillRect(margin, imageY, imageWidth, imageHeight);
            ctx.restore();

            currentY = imageY + imageHeight + 60;

            const circleRadius = 150;
            const circleCenterX = margin + circleRadius;
            const circleCenterY = currentY + circleRadius;
            ctx.save();
            ctx.beginPath();
            ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fill();
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 120px "Poppins", "Helvetica Neue", Arial';
            ctx.fillText(overallRating.toFixed(1), circleCenterX, circleCenterY - 10);
            ctx.font = '500 36px "Poppins", "Helvetica Neue", Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fillText('Valoración', circleCenterX, circleCenterY + 140);
            ctx.restore();

            const barsStartX = circleCenterX + circleRadius + 70;
            const barsMaxWidth = width - barsStartX - margin;
            const barHeight = 44;
            const barGap = 88;
            let barIndex = 0;
            const criteriaEntries = Object.entries(criteriaDefinitions || {}).slice(0, 4);
            for (const [key, definition] of criteriaEntries) {
                if (review?.scores?.[key] === undefined) continue;
                const rawScore = Number.parseFloat(review.scores[key]);
                const min = Number.parseFloat(definition?.min ?? 0);
                const max = Number.parseFloat(definition?.max ?? 10);
                const normalized = max > min ? (rawScore - min) / (max - min) : rawScore / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const barX = barsStartX;
                const barY = circleCenterY - circleRadius + barIndex * barGap;
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                drawRoundedRectPath(ctx, barX, barY, barsMaxWidth, barHeight, 20);
                ctx.fill();
                ctx.fillStyle = '#f58529';
                drawRoundedRectPath(ctx, barX, barY, Math.max(0, barsMaxWidth * clamped), barHeight, 20);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.font = '500 34px "Poppins", "Helvetica Neue", Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText((definition?.label || key).toString(), barX + 16, barY + barHeight / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(rawScore.toFixed(1), barX + barsMaxWidth - 16, barY + barHeight / 2);

                barIndex += 1;
            }

            const metricsBottom = Math.max(
                circleCenterY + circleRadius,
                circleCenterY - circleRadius + barIndex * barGap + 40
            );
            currentY = metricsBottom + 60;

            let comment = (review?.comment || '').toString().trim();
            if (comment.length > 280) comment = `${comment.slice(0, 277)}…`;
            if (comment) {
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = '600 42px "Poppins", "Helvetica Neue", Arial';
                ctx.fillText('Notas rápidas', margin, currentY);
                ctx.font = '400 34px "Poppins", "Helvetica Neue", Arial';
                currentY = wrapText(ctx, `“${comment}”`, margin, currentY + 56, availableWidth, 48);
            }

            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = '500 30px "Poppins", "Helvetica Neue", Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Comparte tu ranking en Listopic', width / 2, height - 200);
            ctx.font = '600 42px "Poppins", "Helvetica Neue", Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('listopic.app', width / 2, height - 140);

            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(result => {
                    if (result) resolve(result);
                    else reject(new Error('No se pudo generar la tarjeta.'));
                }, 'image/png');
            });

            return { blob };
        }

        async function handleShareClick() {
            if (!shareButton) return;
            if (!shareAssetsReady) {
                setShareStatus('Estamos preparando los datos de tu reseña…', 'info');
                return;
            }

            toggleShareLoading(true);
            setShareStatus('Generando tu tarjeta para Instagram…', 'info');

            try {
                const { blob } = await createInstagramStoryCard(shareContext, state.currentListCriteriaDefinitions || {});
                const fileName = `listopic-story-${shareContext.review?.id || 'reseña'}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });
                const shareTitle = `Mi reseña en ${shareContext.place?.name || shareContext.review?.establishmentName || 'Listopic'}`;
                const ratingLabel = overallRatingLabel(shareContext.review);
                const shareText = ratingLabel
                    ? `${shareContext.review?.itemName || 'Mi reseña'} • ${ratingLabel} en Listopic`
                    : `${shareContext.review?.itemName || 'Mi reseña'} en Listopic`;

                let shared = false;
                let canUseWebShare = false;
                if (navigator.canShare) {
                    try {
                        canUseWebShare = navigator.canShare({ files: [file] });
                    } catch (shareCapabilityError) {
                        console.warn('El navegador no permite compartir archivos directamente.', shareCapabilityError);
                        canUseWebShare = false;
                    }
                }

                if (canUseWebShare) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: shareTitle,
                            text: shareText
                        });
                        shared = true;
                        setShareStatus('¡Listo! Si Instagram no se abre automáticamente, revisa tu galería para encontrar la tarjeta.', 'success');
                    } catch (shareError) {
                        if (shareError?.name === 'AbortError') {
                            setShareStatus('Compartir cancelado. Guardamos la tarjeta en tus descargas para que la compartas cuando quieras.', 'info');
                        } else {
                            console.warn('El uso de la API de compartir falló, se ofrecerá descarga manual.', shareError);
                            setShareStatus('No pudimos abrir Instagram automáticamente. Descarga la tarjeta y súbela manualmente.', 'info');
                        }
                        shared = false;
                    }
                }

                if (!shared) {
                    const blobUrl = URL.createObjectURL(blob);
                    if (shareDownloadLink) {
                        shareDownloadLink.href = blobUrl;
                        shareDownloadLink.download = fileName;
                        shareDownloadLink.click();
                    }
                    if (shareHelperEl) shareHelperEl.hidden = false;
                    setShareStatus('Descargamos la tarjeta. Súbela como historia desde tu galería.', 'info');
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }

                if (shared && showNotification) {
                    showNotification('Tarjeta preparada. Completa la publicación en Instagram.', 'success');
                }
            } catch (error) {
                console.error('Error generando la tarjeta de Instagram:', error);
                setShareStatus('No pudimos generar la tarjeta. Inténtalo nuevamente.', 'error');
                if (showNotification) {
                    showNotification(error.message || 'No se pudo crear la tarjeta para compartir.', 'error');
                }
            } finally {
                toggleShareLoading(false);
            }
        }

        function overallRatingLabel(review) {
            if (!review) return '';
            const rating = Number.parseFloat(review.overallRating ?? review.overallScore);
            if (Number.isFinite(rating)) {
                return `${rating.toFixed(1)} ⭐️`;
            }
            return '';
        }

        if (shareButton) {
            shareButton.disabled = true;
            shareButton.setAttribute('aria-busy', 'true');
            shareButton.addEventListener('click', handleShareClick);
            setShareStatus('Preparando datos de tu reseña para compartir…', 'info');
        }

        // Configurar botón de Volver
        if (backButton && listIdFromURL) {
            const fromPlaceIdParam = params.get('fromPlaceId'); // Usar fromPlaceId
            const fromItemParam = params.get('fromItem');
            if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                backButton.href = `grouped-detail-view.html?listId=${listIdFromURL}&placeId=${fromPlaceIdParam}&item=${encodeURIComponent(fromItemParam || '')}`;
            } else {
                backButton.href = `list-view.html?listId=${listIdFromURL}`;
            }
        }

        if (!reviewId || !listIdFromURL) {
            const errorMsg = "Error: Falta ID de reseña o ID de lista en la URL.";
            console.error("DETAIL-VIEW:", errorMsg);
            if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = errorMsg;
            if (ListopicApp.services && ListopicApp.services.showNotification) {
                ListopicApp.services.showNotification(errorMsg, "error");
            }
            return; 
        }

        let reviewDataGlobal;
        let listDataGlobal; // Lo hacemos accesible en un scope más amplio

        // 1. Obtener la reseña
        db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
            .then(reviewDoc => {
                if (!reviewDoc.exists) throw new Error(`Reseña no encontrada.`);
                reviewDataGlobal = { id: reviewDoc.id, ...reviewDoc.data() };
                shareContext.review = reviewDataGlobal;

                // Mostrar datos básicos de la reseña
                if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                
                if (detailImageEl && detailImageEl.parentNode) {
                    if (reviewDataGlobal.photoUrl) {
                        detailImageEl.src = reviewDataGlobal.photoUrl;
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || 'reseña')}`;
                        detailImageEl.style.display = 'block';
                        const placeholderIcon = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                        if(placeholderIcon) placeholderIcon.style.display = 'none';
                    } else {
                        detailImageEl.style.display = 'none';
                        let placeholderIconDiv = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
                        if (!placeholderIconDiv) {
                            placeholderIconDiv = document.createElement('div');
                            placeholderIconDiv.className = 'detail-image-icon-placeholder';
                            detailImageEl.parentNode.insertBefore(placeholderIconDiv, detailImageEl.nextSibling);
                        }
                        placeholderIconDiv.innerHTML = `<i class="fa-solid fa-image"></i>`;
                        placeholderIconDiv.style.display = 'flex';
                    }
                }

                if (detailCommentContainerEl && detailCommentTextEl) {
                    if (reviewDataGlobal.comment) {
                        detailCommentTextEl.innerHTML = uiUtils.escapeHtml(reviewDataGlobal.comment).replace(/\n/g, '<br>');
                        detailCommentContainerEl.style.display = 'block';
                    } else {
                        detailCommentContainerEl.style.display = 'none';
                    }
                }

                if (detailTagsContainerEl && detailTagsDivEl) {
                    if (reviewDataGlobal.userTags && reviewDataGlobal.userTags.length > 0) {
                        detailTagsDivEl.innerHTML = reviewDataGlobal.userTags.map(tag => `<span class="tag-detail">${uiUtils.escapeHtml(tag)}</span>`).join('');
                        detailTagsContainerEl.style.display = 'block';
                    } else {
                        detailTagsContainerEl.style.display = 'none';
                    }
                }

                if (editButton) {
                    let editHref = `review-form.html?listId=${listIdFromURL}&editId=${reviewId}`;
                    const fromPlaceIdParam = params.get('fromPlaceId'); // Usar fromPlaceId
                    const fromItemParam = params.get('fromItem');
                    if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                        editHref += `&fromGrouped=true&fromPlaceId=${fromPlaceIdParam}&fromItem=${encodeURIComponent(fromItemParam || '')}`;
                    }
                    editButton.href = editHref;
                }

                // 2. Obtener la definición de la lista
                return db.collection('lists').doc(listIdFromURL).get();
            })
            .then(listDoc => {
                if (!listDoc.exists) throw new Error("Lista asociada no encontrada.");
                listDataGlobal = listDoc.data(); // Guardar en el scope más amplio
                shareContext.list = { id: listIdFromURL, ...listDataGlobal };
                state.currentListCriteriaDefinitions = listDataGlobal.criteriaDefinition || {};

                if(detailListNameEl && listDataGlobal.name) {
                    detailListNameEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listDataGlobal.name)}</a>`;
                    if (uiUtils.updatePageHeaderInfo) { // Actualizar header común
                        const currentCategory = listDataGlobal.categoryId || "Hmm...";
                        uiUtils.updatePageHeaderInfo(currentCategory, listDataGlobal.name);
                    }
                } else if (detailListNameEl) {
                     detailListNameEl.textContent = "Estás viendo en Listopic: Lista Desconocida";
                     if (uiUtils.updatePageHeaderInfo) uiUtils.updatePageHeaderInfo();
                }
                
                // Renderizar valoraciones detalladas
                if (detailRatingsListEl && reviewDataGlobal && reviewDataGlobal.scores) {
                    detailRatingsListEl.innerHTML = '';
                    if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                        for (const [critKey, critDef] of Object.entries(state.currentListCriteriaDefinitions)) {
                            if (reviewDataGlobal.scores[critKey] !== undefined) {
                                const li = document.createElement('li');
                                const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                                li.innerHTML = `<span class="rating-label">${uiUtils.escapeHtml(critDef.label)}${weightedText}</span> <span class="rating-value">${parseFloat(reviewDataGlobal.scores[critKey]).toFixed(1)}</span>`;
                                detailRatingsListEl.appendChild(li);
                            }
                        }
                    } else {
                        detailRatingsListEl.innerHTML = '<li>No hay criterios definidos para mostrar valoraciones.</li>';
                    }
                } else if (detailRatingsListEl) {
                     detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas disponibles.</li>';
                }

                // 3. Obtener datos del autor de la reseña
                if (reviewDataGlobal.userId && reviewAuthorNameEl) {
                    return db.collection('users').doc(reviewDataGlobal.userId).get(); // Esto devuelve una promesa
                } else {
                    if(reviewAuthorNameEl) reviewAuthorNameEl.textContent = 'Autor no especificado';
                    return Promise.resolve(null); // Devolver promesa resuelta para el siguiente .then()
                }
            })
            .then(userDocOrNull => { // userDocOrNull es el resultado de la promesa del autor
                if (userDocOrNull && userDocOrNull.exists) {
                    const userData = userDocOrNull.data();
                    const authorName = uiUtils.escapeHtml(userData.username || userData.displayName || 'Usuario Anónimo');
                    
                    const authorLink = document.createElement('a');
                    authorLink.href = `profile.html?viewUserId=${reviewDataGlobal.userId}`;
                    authorLink.textContent = authorName;
                    
                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.innerHTML = ''; 
                        reviewAuthorNameEl.appendChild(authorLink);
                    }
                } else if (reviewDataGlobal.userId && reviewAuthorNameEl) { 
                    reviewAuthorNameEl.textContent = 'Usuario Desconocido';
                    console.warn(`Autor de reseña con ID ${reviewDataGlobal.userId} no encontrado.`);
                }
                
                // 4. Si la reseña tiene placeId, obtener datos del lugar
                if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    return db.collection('places').doc(reviewDataGlobal.placeId).get(); // Esto devuelve una promesa
                } else {
                    // No hay placeId, mostrar N/A y resolver para finalizar cadena si es necesario
                    if(detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado";
                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    shareContext.place = null;
                    enableShareFeature();
                    return Promise.resolve(null); // Devolver promesa resuelta
                }
            })
            .then(placeDocOrNull => { // placeDocOrNull es el resultado de la promesa del lugar
                let placeData = null;
                if (placeDocOrNull && placeDocOrNull.exists) {
                    placeData = placeDocOrNull.data();
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = placeData.name || "Nombre de lugar desconocido";
                    
                    if (detailImageEl && detailImageEl.alt === `Foto de reseña`) {
                         detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || placeData.name)}`;
                    }

                    if (detailLocationContainerEl && detailLocationTextEl && detailNoLocationDivEl && (placeData.address || placeData.name || placeData.googleMapsUrl || placeData.googlePlaceId)) {
                        let mapsUrl = "#";
                        if (placeData.googleMapsUrl) mapsUrl = placeData.googleMapsUrl;
                        else if (placeData.googlePlaceId) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.googlePlaceId}`;
                        else if (placeData.location?.latitude && placeData.location?.longitude) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.location.latitude},${placeData.location.longitude}`;

                        if (detailLocationLinkEl) {
                            if (mapsUrl !== "#") {
                                detailLocationLinkEl.href = mapsUrl;
                                detailLocationLinkEl.style.pointerEvents = "auto";
                            } else {
                                detailLocationLinkEl.removeAttribute('href');
                                detailLocationLinkEl.style.pointerEvents = "none";
                            }
                        }
                        detailLocationTextEl.textContent = placeData.address || placeData.name;
                        detailNoLocationDivEl.style.display = 'none';
                        detailLocationContainerEl.style.display = 'block';
                    } else {
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                    }
                } else if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Lugar no encontrado en BD";
                    console.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                    if (detailNoLocationDivEl) detailNoLocationDivEl.style.display = 'flex';
                }
                shareContext.place = placeData;
                enableShareFeature();
                // Si placeDocOrNull es null, ya se manejó el caso sin placeId antes
            })
            .catch(error => {
                console.error("Error fetching details for detail view:", error);
                if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar datos";
                if (ListopicApp.services && ListopicApp.services.showNotification) {
                     ListopicApp.services.showNotification(error.message || "Error al cargar los detalles.", "error");
                }
                setShareStatus('No se pudo preparar la tarjeta para compartir.', 'error');
                if (shareButton) {
                    shareAssetsReady = false;
                    shareButton.disabled = true;
                    shareButton.removeAttribute('data-loading');
                    shareButton.removeAttribute('aria-busy');
                }
            });

        // Listener para el botón de eliminar
        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                if (!reviewId || !listIdFromURL) {
                    ListopicApp.services.showNotification("No se puede eliminar: falta información.", "error");
                    return;
                }
                if (confirm('¿Estás seguro de que quieres eliminar esta reseña?')) {
                    try {
                        await db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).delete();
                        ListopicApp.services.showNotification('Reseña eliminada.', 'success');
                        
                        // Redirigir
                        const fromPlaceIdParam = params.get('fromPlaceId');
                        const fromItemParam = params.get('fromItem');
                        if (params.get('fromGrouped') === 'true' && fromPlaceIdParam) {
                            window.location.href = `grouped-detail-view.html?listId=${listIdFromURL}&placeId=${fromPlaceIdParam}&item=${encodeURIComponent(fromItemParam || '')}`;
                        } else {
                            window.location.href = `list-view.html?listId=${listIdFromURL}`;
                        }
                    } catch (error) {
                        ListopicApp.services.showNotification(`No se pudo eliminar: ${error.message}`, 'error');
                    }
                }
            });
        }
    } // Fin de init

    return {
        init
    };
})();