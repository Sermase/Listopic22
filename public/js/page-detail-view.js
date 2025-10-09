window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    const STORY_DEFAULT_CUSTOMIZATION = {
        colorScheme: 'midnight',
        graphicStyle: 'radar'
    };

    const STORY_GRAPHIC_STYLES = [
        { value: 'bars', label: 'Barras' },
        { value: 'radar', label: 'Tela de araña' }
    ];

    const STORY_COLOR_SCHEMES = {
        midnight: {
            label: 'Aurora nocturna',
            background: ['#0f172a', '#1f2937'],
            overlayShape: 'rgba(255,255,255,0.08)',
            accentPrimary: '#f97316',
            accentSecondary: '#facc15',
            accentTertiary: '#06b6d4',
            barTrack: 'rgba(255,255,255,0.14)',
            metricFill: 'rgba(255,255,255,0.12)',
            metricStroke: 'rgba(255,255,255,0.35)',
            panelTint: 'rgba(15,23,42,0.55)',
            textMuted: 'rgba(255,255,255,0.75)',
            fallbackGradient: ['#f97316', '#fb7185'],
            radarGrid: 'rgba(255,255,255,0.18)',
            radarAxis: 'rgba(255,255,255,0.24)'
        },
        sunset: {
            label: 'Atardecer brillante',
            background: ['#37102d', '#ea5f6c'],
            overlayShape: 'rgba(255,255,255,0.12)',
            accentPrimary: '#ff8a5b',
            accentSecondary: '#ffd166',
            accentTertiary: '#ff6f91',
            barTrack: 'rgba(255,255,255,0.18)',
            metricFill: 'rgba(255,255,255,0.14)',
            metricStroke: 'rgba(255,255,255,0.32)',
            panelTint: 'rgba(58,18,41,0.55)',
            textMuted: 'rgba(255,255,255,0.82)',
            fallbackGradient: ['#ff9a8b', '#ff6a88'],
            radarGrid: 'rgba(255,255,255,0.22)',
            radarAxis: 'rgba(255,255,255,0.3)'
        },
        ocean: {
            label: 'Olas frías',
            background: ['#02203a', '#065a82'],
            overlayShape: 'rgba(255,255,255,0.1)',
            accentPrimary: '#3cd5ff',
            accentSecondary: '#f4a259',
            accentTertiary: '#00bcd4',
            barTrack: 'rgba(255,255,255,0.16)',
            metricFill: 'rgba(255,255,255,0.14)',
            metricStroke: 'rgba(255,255,255,0.3)',
            panelTint: 'rgba(3,24,45,0.6)',
            textMuted: 'rgba(225,245,255,0.76)',
            fallbackGradient: ['#00b4d8', '#0077b6'],
            radarGrid: 'rgba(255,255,255,0.2)',
            radarAxis: 'rgba(255,255,255,0.28)'
        },
        forest: {
            label: 'Bosque vivo',
            background: ['#0b1f1a', '#164b2f'],
            overlayShape: 'rgba(255,255,255,0.1)',
            accentPrimary: '#4ade80',
            accentSecondary: '#facc15',
            accentTertiary: '#34d399',
            barTrack: 'rgba(255,255,255,0.14)',
            metricFill: 'rgba(255,255,255,0.12)',
            metricStroke: 'rgba(255,255,255,0.3)',
            panelTint: 'rgba(9,34,23,0.6)',
            textMuted: 'rgba(226,255,234,0.78)',
            fallbackGradient: ['#10b981', '#22c55e'],
            radarGrid: 'rgba(255,255,255,0.2)',
            radarAxis: 'rgba(255,255,255,0.3)'
        }
    };

    function getColorScheme(name) {
        return STORY_COLOR_SCHEMES[name] || STORY_COLOR_SCHEMES.midnight;
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        if (!text) {
            return y;
        }
        const words = text.toString().split(/\s+/);
        let line = '';
        for (let n = 0; n < words.length; n += 1) {
            const testLine = line ? `${line} ${words[n]}` : words[n];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n];
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
        return y + lineHeight;
    }

    function drawRoundedRectPath(ctx, x, y, width, height, radius) {
        const effectiveRadius = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + effectiveRadius, y);
        ctx.lineTo(x + width - effectiveRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + effectiveRadius);
        ctx.lineTo(x + width, y + height - effectiveRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - effectiveRadius, y + height);
        ctx.lineTo(x + effectiveRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - effectiveRadius);
        ctx.lineTo(x, y + effectiveRadius);
        ctx.quadraticCurveTo(x, y, x + effectiveRadius, y);
        ctx.closePath();
    }

    function drawRoundedImage(ctx, img, x, y, width, height, radius) {
        ctx.save();
        ctx.clip();
        drawRoundedRectPath(ctx, x, y, width, height, radius);
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

    let cachedListopicLogoImage = null;
    let cachedDefaultAvatarImage = null;

    async function loadListopicLogoImage() {
        if (cachedListopicLogoImage) {
            return cachedListopicLogoImage;
        }
        try {
            cachedListopicLogoImage = await loadImageSafely('img/logo-listopic400.png');
        } catch (error) {
            console.warn('No se pudo cargar el logo de Listopic para la tarjeta.', error);
            cachedListopicLogoImage = null;
        }
        return cachedListopicLogoImage;
    }

    async function loadDefaultAvatarImage() {
        if (cachedDefaultAvatarImage) {
            return cachedDefaultAvatarImage;
        }
        try {
            cachedDefaultAvatarImage = await loadImageSafely('img/default-avatar.png');
        } catch (error) {
            console.warn('No se pudo cargar el avatar por defecto para la tarjeta.', error);
            cachedDefaultAvatarImage = null;
        }
        return cachedDefaultAvatarImage;
    }

    async function resolveAuthorPhoto(author) {
        if (author && author.photoUrl) {
            try {
                return await loadImageSafely(author.photoUrl);
            } catch (error) {
                console.warn('No se pudo cargar la foto del autor para la tarjeta.', error);
            }
        }
        return await loadDefaultAvatarImage();
    }

    function getAuthorInitials(name) {
        if (!name) {
            return '';
        }
        const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (parts.length === 0) {
            return '';
        }
        return parts.map(part => part.charAt(0).toUpperCase()).join('');
    }

    function hexToRgba(hex, alpha) {
        if (!hex) {
            return `rgba(255,255,255,${alpha ?? 1})`;
        }
        let normalized = String(hex).trim().replace('#', '');
        if (normalized.length === 3) {
            normalized = normalized.split('').map(char => char + char).join('');
        }
        if (normalized.length !== 6) {
            return `rgba(255,255,255,${alpha ?? 1})`;
        }
        const intValue = Number.parseInt(normalized, 16);
        if (Number.isNaN(intValue)) {
            return `rgba(255,255,255,${alpha ?? 1})`;
        }
        const r = (intValue >> 16) & 255;
        const g = (intValue >> 8) & 255;
        const b = intValue & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha ?? 1})`;
    }

    function getPreferredPhotoUrl(review = {}, place = {}) {
        const reviewCandidates = [
            review?.photoUrl,
            review?.imageUrl,
            review?.coverImageUrl,
            review?.coverPhotoUrl
        ].filter(candidate => typeof candidate === 'string' && candidate.trim().length);
        if (reviewCandidates.length > 0) {
            return reviewCandidates[0];
        }

        const placeCandidates = [
            place?.mainImageUrl,
            place?.photoUrl,
            place?.coverImageUrl,
            place?.featuredImageUrl,
            place?.imageUrl
        ];

        if (Array.isArray(place?.photos)) {
            for (const photo of place.photos) {
                if (!photo) {
                    continue;
                }
                if (typeof photo === 'string' && photo.trim().length) {
                    placeCandidates.push(photo);
                } else if (typeof photo === 'object' && typeof photo.url === 'string' && photo.url.trim().length) {
                    placeCandidates.push(photo.url);
                }
            }
        }

        return placeCandidates.find(candidate => typeof candidate === 'string' && candidate.trim().length) || '';
    }

    function getCriterionLabel(definition, fallbackKey) {
        if (!definition) {
            return fallbackKey;
        }
        const candidates = [
            definition.label,
            definition.name,
            definition.title,
            definition.displayName,
            definition.originalLabel,
            definition.labelOriginal
        ];
        const label = candidates.find(candidate => typeof candidate === 'string' && candidate.trim().length);
        return label || fallbackKey;
    }

    function coerceToDate(value) {
        if (!value) {
            return null;
        }
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value;
        }
        if (typeof value.toDate === 'function') {
            try {
                const result = value.toDate();
                if (result instanceof Date && !Number.isNaN(result.getTime())) {
                    return result;
                }
            } catch (error) {
                console.warn('[detailView] No se pudo convertir timestamp con toDate.', error);
            }
        }
        if (typeof value.toMillis === 'function') {
            const millis = Number(value.toMillis());
            if (Number.isFinite(millis)) {
                const date = new Date(millis);
                if (!Number.isNaN(date.getTime())) {
                    return date;
                }
            }
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            const fromNumber = new Date(value);
            if (!Number.isNaN(fromNumber.getTime())) {
                return fromNumber;
            }
        }
        if (typeof value === 'string') {
            const fromString = new Date(value);
            if (!Number.isNaN(fromString.getTime())) {
                return fromString;
            }
        }
        if (typeof value === 'object' && typeof value.seconds === 'number') {
            const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
            const fromComponents = new Date(millis);
            if (!Number.isNaN(fromComponents.getTime())) {
                return fromComponents;
            }
        }
        return null;
    }

    function formatDateForDisplay(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }
        try {
            return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(date);
        } catch (error) {
            console.warn('[detailView] No se pudo formatear la fecha con Intl.DateTimeFormat.', error);
            return date.toLocaleDateString('es-ES');
        }
    }

    async function createInstagramStoryCard(context, criteriaDefinitions = {}, customization = {}) {
        const { review, list, place, author } = context || {};
        const { colorScheme = STORY_DEFAULT_CUSTOMIZATION.colorScheme, graphicStyle = STORY_DEFAULT_CUSTOMIZATION.graphicStyle } = customization || {};
        const scheme = getColorScheme(colorScheme);
        const canvas = document.createElement('canvas');
        const width = 1080;
        const height = 1920;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, scheme.background[0]);
        gradient.addColorStop(1, scheme.background[1]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.fillStyle = scheme.overlayShape;
        for (let i = -width; i < width * 2; i += 180) {
            ctx.beginPath();
            ctx.ellipse(i, height * 0.3, 220, 80, Math.PI / 6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        const margin = 96;
        const availableWidth = width - margin * 2;

        const dishName = (review?.itemName || 'Mi reseña favorita').toString();
        const placeName = (place?.name || review?.establishmentName || 'Lugar especial').toString();
        const listName = (list?.name || 'Mi ranking personal').toString();
        const authorName = (author?.name || review?.authorName || review?.userDisplayName || 'Autor anónimo').toString();
        const overallRating = Number.parseFloat(review?.overallRating ?? review?.overallScore ?? 0) || 0;

        const authorPhoto = await resolveAuthorPhoto(author);
        const authorInitials = getAuthorInitials(authorName);
        const logoImage = await loadListopicLogoImage();

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
        const preferredPhotoUrl = getPreferredPhotoUrl(review, place);
        if (preferredPhotoUrl) {
            try {
                const img = await loadImageSafely(preferredPhotoUrl);
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
            fallbackGradient.addColorStop(0, scheme.fallbackGradient[0]);
            fallbackGradient.addColorStop(1, scheme.fallbackGradient[1]);
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

        const badgeRadius = 72;
        const badgeCenterX = margin + badgeRadius + 24;
        const badgeCenterY = imageY + imageHeight - badgeRadius - 32;

        const drawAuthorBadge = () => {
            if (!authorPhoto && !authorInitials) {
                return;
            }
            ctx.save();
            ctx.beginPath();
            ctx.arc(badgeCenterX, badgeCenterY, badgeRadius + 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(badgeCenterX, badgeCenterY, badgeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.clip();
            if (authorPhoto) {
                const scale = Math.max((badgeRadius * 2) / authorPhoto.width, (badgeRadius * 2) / authorPhoto.height);
                const drawWidth = authorPhoto.width * scale;
                const drawHeight = authorPhoto.height * scale;
                ctx.drawImage(authorPhoto, badgeCenterX - drawWidth / 2, badgeCenterY - drawHeight / 2, drawWidth, drawHeight);
            } else {
                const avatarGradient = ctx.createLinearGradient(badgeCenterX - badgeRadius, badgeCenterY - badgeRadius, badgeCenterX + badgeRadius, badgeCenterY + badgeRadius);
                avatarGradient.addColorStop(0, scheme.accentPrimary);
                avatarGradient.addColorStop(1, scheme.accentTertiary);
                ctx.fillStyle = avatarGradient;
                ctx.fillRect(badgeCenterX - badgeRadius, badgeCenterY - badgeRadius, badgeRadius * 2, badgeRadius * 2);
            }
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(badgeCenterX, badgeCenterY, badgeRadius, 0, Math.PI * 2);
            ctx.lineWidth = 4;
            ctx.strokeStyle = scheme.accentSecondary;
            ctx.stroke();
            ctx.restore();

            if (!authorPhoto && authorInitials) {
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.font = '600 42px "Poppins", "Helvetica Neue", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(authorInitials, badgeCenterX, badgeCenterY);
                ctx.restore();
            }

            const boxHeight = 72;
            const textWidth = ctx.measureText(authorName).width;
            let boxWidth = Math.min(420, Math.max(220, textWidth + 60));
            let boxX = badgeCenterX + badgeRadius + 28;
            const maxBoxX = margin + imageWidth - boxWidth - 24;
            if (boxX > maxBoxX) {
                boxX = maxBoxX;
            }
            if (boxX < margin + badgeRadius * 2 + 32) {
                boxX = margin + badgeRadius * 2 + 32;
            }
            if (boxX + boxWidth > margin + imageWidth - 24) {
                boxWidth = margin + imageWidth - 24 - boxX;
            }
            const boxY = badgeCenterY - boxHeight / 2;

            ctx.save();
            drawRoundedRectPath(ctx, boxX, boxY, boxWidth, boxHeight, 28);
            ctx.fillStyle = scheme.panelTint;
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.textAlign = 'left';
            ctx.fillStyle = scheme.textMuted;
            ctx.font = '600 20px "Poppins", "Helvetica Neue", Arial';
            ctx.fillText('Autor', boxX + 22, boxY + 20);
            ctx.fillStyle = '#ffffff';
            ctx.font = '500 30px "Poppins", "Helvetica Neue", Arial';
            ctx.textBaseline = 'bottom';
            ctx.fillText(authorName, boxX + 22, boxY + boxHeight - 16);
            ctx.restore();
        };

        drawAuthorBadge();

        if (logoImage) {
            const logoSize = 140;
            const logoPadding = 28;
            const logoX = margin + imageWidth - logoSize - logoPadding;
            const logoY = imageY + logoPadding;
            ctx.save();
            drawRoundedRectPath(ctx, logoX - 18, logoY - 18, logoSize + 36, logoSize + 36, 24);
            ctx.fillStyle = hexToRgba(scheme.accentSecondary, 0.18);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
            ctx.restore();
        }

        let currentMetricsY = imageY + imageHeight + 60;

        const circleRadius = 150;
        const circleCenterX = margin + circleRadius;
        const circleCenterY = currentMetricsY + circleRadius;
        ctx.save();
        ctx.beginPath();
        ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = scheme.metricFill;
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = scheme.metricStroke;
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

        const availableCriteria = [];
        if (criteriaDefinitions && typeof criteriaDefinitions === 'object' && Object.keys(criteriaDefinitions).length > 0) {
            for (const [key, definition] of Object.entries(criteriaDefinitions)) {
                if (review?.scores?.[key] === undefined) {
                    continue;
                }
                const value = Number.parseFloat(review.scores[key]);
                if (!Number.isFinite(value)) {
                    continue;
                }
                availableCriteria.push([key, definition]);
            }
        } else if (review?.scores) {
            for (const key of Object.keys(review.scores)) {
                const value = Number.parseFloat(review.scores[key]);
                if (!Number.isFinite(value)) {
                    continue;
                }
                availableCriteria.push([key, { label: key, min: 0, max: 10 }]);
            }
        }

        const barsStartX = circleCenterX + circleRadius + 70;
        const barsMaxWidth = width - barsStartX - margin;
        const barHeight = 44;
        const barGap = 88;

        const drawBarsGraphic = (entries) => {
            if (!entries.length) {
                return circleCenterY + circleRadius;
            }
            let index = 0;
            let lastBottom = circleCenterY - circleRadius;
            for (const [key, definition] of entries) {
                const raw = Number.parseFloat(review.scores[key]);
                const min = Number.parseFloat(definition?.min ?? 0);
                const max = Number.parseFloat(definition?.max ?? 10);
                const normalized = max > min ? (raw - min) / (max - min) : raw / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const barY = circleCenterY - circleRadius + index * barGap;
                ctx.fillStyle = scheme.barTrack;
                drawRoundedRectPath(ctx, barsStartX, barY, barsMaxWidth, barHeight, 20);
                ctx.fill();
                ctx.fillStyle = scheme.accentPrimary;
                drawRoundedRectPath(ctx, barsStartX, barY, Math.max(0, barsMaxWidth * clamped), barHeight, 20);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.font = '500 34px "Poppins", "Helvetica Neue", Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const label = getCriterionLabel(definition, key).toString();
                ctx.fillText(label, barsStartX + 16, barY + barHeight / 2);

                ctx.textAlign = 'right';
                ctx.fillStyle = scheme.textMuted;
                ctx.fillText(raw.toFixed(1), barsStartX + barsMaxWidth - 16, barY + barHeight / 2);

                index += 1;
                lastBottom = barY + barHeight;
            }
            return lastBottom + 40;
        };

        const drawRadarGraphic = (entries) => {
            const metricsAreaX = circleCenterX + circleRadius + 70;
            const metricsAreaWidth = width - metricsAreaX - margin;
            const centerX = metricsAreaX + metricsAreaWidth / 2;
            const centerY = circleCenterY;
            const radius = Math.min(metricsAreaWidth / 2, circleRadius * 1.7, 260);
            const levels = 5;

            ctx.save();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = scheme.radarGrid;
            for (let step = 1; step <= levels; step += 1) {
                const ratio = step / levels;
                ctx.beginPath();
                entries.forEach(([key, definition], index) => {
                    const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
                    const x = centerX + Math.cos(angle) * radius * ratio;
                    const y = centerY + Math.sin(angle) * radius * ratio;
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.closePath();
                ctx.stroke();
            }

            ctx.strokeStyle = scheme.radarAxis;
            entries.forEach((entry, index) => {
                const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
                ctx.stroke();
            });

            ctx.beginPath();
            entries.forEach(([key, definition], index) => {
                const raw = Number.parseFloat(review.scores[key]);
                const min = Number.parseFloat(definition?.min ?? 0);
                const max = Number.parseFloat(definition?.max ?? 10);
                const normalized = max > min ? (raw - min) / (max - min) : raw / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius * clamped;
                const y = centerY + Math.sin(angle) * radius * clamped;
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();
            ctx.fillStyle = hexToRgba(scheme.accentPrimary, 0.32);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = scheme.accentPrimary;
            ctx.stroke();

            entries.forEach(([key, definition], index) => {
                const raw = Number.parseFloat(review.scores[key]);
                const min = Number.parseFloat(definition?.min ?? 0);
                const max = Number.parseFloat(definition?.max ?? 10);
                const normalized = max > min ? (raw - min) / (max - min) : raw / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius * clamped;
                const y = centerY + Math.sin(angle) * radius * clamped;
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            });

            entries.forEach(([key, definition], index) => {
                const raw = Number.parseFloat(review.scores[key]);
                const label = getCriterionLabel(definition, key).toString();
                const angle = (Math.PI * 2 * index) / entries.length - Math.PI / 2;
                let textAlign = 'center';
                if (Math.cos(angle) > 0.2) {
                    textAlign = 'left';
                } else if (Math.cos(angle) < -0.2) {
                    textAlign = 'right';
                }
                const labelX = centerX + Math.cos(angle) * (radius + 36);
                const labelY = centerY + Math.sin(angle) * (radius + 36);
                ctx.textAlign = textAlign;
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.font = '500 30px "Poppins", "Helvetica Neue", Arial';
                ctx.fillText(label, labelX, labelY);
                ctx.fillStyle = scheme.textMuted;
                ctx.font = '400 24px "Poppins", "Helvetica Neue", Arial';
                ctx.fillText(raw.toFixed(1), labelX, labelY + 26);
            });

            ctx.restore();
            return centerY + radius + 40;
        };

        let metricsBottom = circleCenterY + circleRadius;
        if (graphicStyle === 'radar' && availableCriteria.length >= 3) {
            metricsBottom = Math.max(metricsBottom, drawRadarGraphic(availableCriteria.slice(0, 6)));
        } else {
            metricsBottom = Math.max(metricsBottom, drawBarsGraphic(availableCriteria.slice(0, 4)));
        }

        currentMetricsY = metricsBottom + 60;

        let comment = (review?.comment || '').toString().trim();
        if (comment.length > 280) comment = `${comment.slice(0, 277)}…`;
        if (comment) {
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = '600 42px "Poppins", "Helvetica Neue", Arial';
            ctx.fillText('Notas rápidas', margin, currentMetricsY);
            ctx.font = '400 34px "Poppins", "Helvetica Neue", Arial';
            currentMetricsY = wrapText(ctx, `“${comment}”`, margin, currentMetricsY + 56, availableWidth, 48);
        }

        ctx.fillStyle = scheme.textMuted;
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

    async function loadShareContext(listId, reviewId) {
        const services = window.ListopicApp?.services;
        if (!services?.db) {
            throw new Error('Servicios de Firebase no disponibles.');
        }
        if (!listId || !reviewId) {
            throw new Error('Faltan datos para preparar la tarjeta.');
        }

        const listRef = services.db.collection('lists').doc(listId);
        const reviewRef = listRef.collection('reviews').doc(reviewId);
        const reviewDoc = await reviewRef.get();
        if (!reviewDoc.exists) {
            throw new Error('No encontramos esa reseña.');
        }
        const reviewData = { id: reviewDoc.id, ...reviewDoc.data() };

        let listDoc = null;
        let listData = null;
        try {
            listDoc = await listRef.get();
            if (listDoc.exists) {
                listData = { id: listDoc.id, ...listDoc.data() };
            }
        } catch (error) {
            console.warn('No se pudo cargar la lista asociada para la tarjeta.', error);
        }

        let placeData = null;
        if (reviewData.placeId) {
            try {
                const placeDoc = await services.db.collection('places').doc(reviewData.placeId).get();
                if (placeDoc.exists) {
                    placeData = { id: placeDoc.id, ...placeDoc.data() };
                }
            } catch (error) {
                console.warn('No se pudo cargar el lugar asociado para la tarjeta.', error);
            }
        }

        const authorInfo = {
            id: reviewData.userId || reviewData.authorId || null,
            name: reviewData.authorName || reviewData.userDisplayName || reviewData.username || '',
            photoUrl: reviewData.authorPhotoUrl || ''
        };

        const criteriaDefinitions = listData?.criteriaDefinitions || listData?.defaultCriteriaDefinitions || {};

        return {
            context: {
                review: reviewData,
                list: listData,
                place: placeData,
                author: authorInfo
            },
            criteriaDefinitions
        };
    }

    ListopicApp.storyShare = Object.assign({}, ListopicApp.storyShare, {
        createInstagramStoryCard,
        getDefaultCustomization: () => ({ ...STORY_DEFAULT_CUSTOMIZATION }),
        getColorSchemeOptions: () => Object.entries(STORY_COLOR_SCHEMES).map(([value, scheme]) => ({ value, label: scheme.label })),
        getGraphicStyleOptions: () => STORY_GRAPHIC_STYLES.map(option => ({ ...option })),
        loadShareContext
    });

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
        const reviewAuthorNameEl = document.getElementById('review-author-name');
        const reviewAuthorAvatarEl = document.getElementById('review-author-avatar');
        const detailPlaceLinkEl = document.getElementById('detail-place-link');
        const detailImageEl = document.getElementById('detail-image');
        const reviewCreatedDateEl = document.getElementById('review-created-date');
        const reviewDateContainerEl = document.getElementById('review-date-container');
        const detailChartSectionEl = document.getElementById('detail-chart-section');
        const detailChartCanvasEl = document.getElementById('detail-chart-canvas');
        const detailChartStyleSelectEl = document.getElementById('detail-chart-style');
        const detailChartMessageEl = document.getElementById('detail-chart-message');

        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button');
        const deleteButton = document.querySelector('.delete-button.danger');
        const shareButton = document.getElementById('detail-share-button');
        const saveButton = document.getElementById('detail-save-button');
        const showNotification = ListopicApp.services?.showNotification;
        const currentUserId = auth?.currentUser?.uid || null;

        let shareModalData = null;
        let displayPhotoUrl = '';
        let awaitingFallbackImage = false;
        let chartInstance = null;
        let chartSourceData = null;
        let archiveDescriptor = null;
        let archiveEntityKey = null;
        let archiveMembership = [];
        let archiveEventHandler = null;

        const applyArchiveSavedState = (saved) => {
            if (!saveButton) {
                return;
            }
            const isSaved = Boolean(saved);
            saveButton.classList.toggle('is-archived', isSaved);
            saveButton.innerHTML = isSaved
                ? '<i class="fas fa-check"></i> Guardado'
                : '<i class="fas fa-bookmark"></i> Guardar';
        };

        const syncArchiveMembership = () => {
            const archiveService = window.ListopicApp?.archiveService;
            if (!archiveService || !archiveDescriptor) {
                applyArchiveSavedState(false);
                return;
            }
            archiveService.getEntityArchiveIds(archiveDescriptor)
                .then((ids) => {
                    archiveMembership = Array.isArray(ids) ? ids : [];
                    applyArchiveSavedState(archiveMembership.length > 0);
                })
                .catch(() => applyArchiveSavedState(false));
        };

        const updateSaveButton = () => {
            if (!saveButton) {
                return;
            }
            const archiveService = window.ListopicApp?.archiveService;
            if (!archiveService || typeof archiveService.openSaveModal !== 'function' || !archiveDescriptor) {
                saveButton.style.display = 'none';
                saveButton.onclick = null;
                return;
            }
            saveButton.style.display = 'inline-flex';
            saveButton.disabled = false;
            if (archiveDescriptor.listId && archiveDescriptor.reviewId) {
                archiveEntityKey = `review:${archiveDescriptor.listId}:${archiveDescriptor.reviewId}`;
            }
            if (archiveEventHandler) {
                window.removeEventListener('archive:updated', archiveEventHandler);
            }
            archiveEventHandler = (event) => {
                if (!archiveEntityKey) {
                    return;
                }
                if (event.detail?.entityKey === archiveEntityKey) {
                    const ids = event.detail.archiveIds || [];
                    archiveMembership = Array.isArray(ids) ? ids : [];
                    applyArchiveSavedState(archiveMembership.length > 0);
                }
            };
            window.addEventListener('archive:updated', archiveEventHandler);
            applyArchiveSavedState(archiveMembership.length > 0);
            saveButton.onclick = () => {
                try {
                    archiveService.openSaveModal({ ...archiveDescriptor });
                } catch (error) {
                    console.error('[detail-view] Error al abrir El Archivo:', error);
                    window.ListopicApp?.services?.showNotification?.(error.message || 'No se pudo abrir El Archivo.', 'error');
                }
            };
        };

        const setNoLocationVisible = (visible) => {
            if (!detailNoLocationDivEl) {
                return;
            }
            detailNoLocationDivEl.style.display = visible ? 'flex' : 'none';
            if (visible) {
                detailNoLocationDivEl.removeAttribute('hidden');
            } else {
                detailNoLocationDivEl.setAttribute('hidden', 'true');
            }
        };
        setNoLocationVisible(false);

        if (detailChartStyleSelectEl) {
            detailChartStyleSelectEl.value = 'radar';
        }

        const destroyDetailChart = () => {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            if (detailChartCanvasEl) {
                const context = detailChartCanvasEl.getContext('2d');
                if (context) {
                    context.clearRect(0, 0, detailChartCanvasEl.width || 0, detailChartCanvasEl.height || 0);
                }
            }
        };

        const setChartMessage = (message = '') => {
            if (!detailChartMessageEl) {
                return;
            }
            if (!message) {
                detailChartMessageEl.hidden = true;
                detailChartMessageEl.textContent = '';
            } else {
                detailChartMessageEl.textContent = message;
                detailChartMessageEl.hidden = false;
            }
        };

        const prepareChartSourceData = (reviewData, entries) => {
            const empty = { labels: [], values: [], maxima: [], min: 0, max: 0 };
            if (!reviewData || !reviewData.scores || !Array.isArray(entries) || entries.length === 0) {
                return empty;
            }
            const labels = [];
            const values = [];
            const maxima = [];
            let globalMin = 0;
            let globalMax = 0;
            for (const [key, definition] of entries) {
                if (reviewData.scores[key] === undefined) {
                    continue;
                }
                const rawValue = Number.parseFloat(reviewData.scores[key]);
                if (!Number.isFinite(rawValue)) {
                    continue;
                }
                const minValue = Number.isFinite(Number(definition?.min)) ? Number(definition.min) : 0;
                const maxValue = Number.isFinite(Number(definition?.max)) ? Number(definition.max) : Math.max(10, rawValue);
                const clampedValue = Math.min(Math.max(rawValue, minValue), maxValue);
                const labelText = getCriterionLabel(definition, key).toString();
                labels.push(labelText);
                values.push(Number.parseFloat(clampedValue.toFixed(2)));
                maxima.push(maxValue);
                globalMin = Math.min(globalMin, minValue, 0);
                globalMax = Math.max(globalMax, maxValue, clampedValue);
            }
            if (!labels.length) {
                return empty;
            }
            return { labels, values, maxima, min: globalMin, max: globalMax };
        };

        const renderDetailChart = (style = 'radar') => {
            if (!detailChartSectionEl) {
                return;
            }
            if (!chartSourceData || !chartSourceData.labels.length) {
                destroyDetailChart();
                detailChartSectionEl.hidden = true;
                setChartMessage('');
                if (detailChartStyleSelectEl) {
                    detailChartStyleSelectEl.disabled = false;
                }
                return;
            }
            if (typeof window.Chart === 'undefined' || !detailChartCanvasEl) {
                destroyDetailChart();
                detailChartSectionEl.hidden = false;
                setChartMessage('No se pudo inicializar el módulo de gráficas en este navegador.');
                if (detailChartStyleSelectEl) {
                    detailChartStyleSelectEl.disabled = true;
                }
                return;
            }
            detailChartSectionEl.hidden = false;
            setChartMessage('');
            if (detailChartStyleSelectEl) {
                detailChartStyleSelectEl.disabled = false;
            }
            const ctx = detailChartCanvasEl.getContext('2d');
            if (!ctx) {
                return;
            }
            destroyDetailChart();
            const maxValue = chartSourceData.values.length ? Math.max(...chartSourceData.values) : 0;
            const chartMax = Math.max(chartSourceData.max || 0, maxValue, 0);
            const suggestedMax = chartMax > 0 ? chartMax + chartMax * 0.1 : 5;
            const resolvedStyle = style === 'bars' ? 'bar' : 'radar';
            const tooltipLabelFormatter = (context) => {
                const value = Number.parseFloat(context.raw ?? 0);
                const label = context.label || chartSourceData.labels?.[context.dataIndex] || '';
                const maxForEntry = chartSourceData.maxima?.[context.dataIndex];
                const formattedValue = Number.isFinite(value) ? value.toFixed(1) : value;
                if (Number.isFinite(maxForEntry)) {
                    return `${label}: ${formattedValue} / ${Number(maxForEntry).toFixed(1)}`;
                }
                return `${label}: ${formattedValue}`;
            };

            if (resolvedStyle === 'bar') {
                const gradient = ctx.createLinearGradient(0, 0, detailChartCanvasEl.width || 400, 0);
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.95)');
                gradient.addColorStop(1, 'rgba(129, 140, 248, 0.65)');
                chartInstance = new window.Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: chartSourceData.labels,
                        datasets: [{
                            data: chartSourceData.values,
                            backgroundColor: gradient,
                            borderRadius: 14,
                            borderSkipped: false,
                            hoverBackgroundColor: 'rgba(59, 130, 246, 0.98)',
                            maxBarThickness: 46
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        scales: {
                            x: {
                                beginAtZero: true,
                                suggestedMax,
                                grid: {
                                    color: 'rgba(148, 163, 184, 0.2)'
                                },
                                ticks: {
                                    color: 'rgba(226, 232, 240, 0.9)',
                                    font: { family: 'Poppins, Arial, sans-serif' }
                                }
                            },
                            y: {
                                grid: { display: false },
                                ticks: {
                                    color: '#f8fafc',
                                    font: { family: 'Poppins, Arial, sans-serif', weight: '500' }
                                }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                borderColor: 'rgba(96, 165, 250, 0.75)',
                                borderWidth: 1,
                                displayColors: false,
                                titleColor: '#e2e8f0',
                                bodyColor: '#f8fafc',
                                callbacks: {
                                    label: tooltipLabelFormatter
                                }
                            }
                        },
                        animation: {
                            duration: 600,
                            easing: 'easeOutQuart'
                        }
                    }
                });
                return;
            }

            chartInstance = new window.Chart(ctx, {
                type: 'radar',
                data: {
                    labels: chartSourceData.labels,
                    datasets: [{
                        data: chartSourceData.values,
                        fill: true,
                        backgroundColor: 'rgba(129, 140, 248, 0.28)',
                        borderColor: 'rgba(59, 130, 246, 0.95)',
                        pointBackgroundColor: '#f8fafc',
                        pointBorderColor: 'rgba(59, 130, 246, 1)',
                        pointHoverBackgroundColor: '#ffffff',
                        pointHoverBorderColor: 'rgba(37, 99, 235, 1)',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            beginAtZero: true,
                            suggestedMax,
                            grid: {
                                color: 'rgba(148, 163, 184, 0.18)'
                            },
                            angleLines: {
                                color: 'rgba(148, 163, 184, 0.25)'
                            },
                            ticks: {
                                showLabelBackdrop: true,
                                backdropColor: 'rgba(15, 23, 42, 0.6)',
                                color: 'rgba(226, 232, 240, 0.85)',
                                font: { family: 'Poppins, Arial, sans-serif' }
                            },
                            pointLabels: {
                                color: '#f8fafc',
                                font: { family: 'Poppins, Arial, sans-serif', size: 12 }
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(96, 165, 250, 0.75)',
                            borderWidth: 1,
                            displayColors: false,
                            titleColor: '#e2e8f0',
                            bodyColor: '#f8fafc',
                            callbacks: {
                                label: tooltipLabelFormatter
                            }
                        }
                    }
                }
            });
        };

        const updateDetailChart = (reviewData, entries) => {
            if (!detailChartSectionEl) {
                return;
            }
            if (!reviewData || !Array.isArray(entries) || !entries.length) {
                chartSourceData = null;
                destroyDetailChart();
                if (detailChartSectionEl) {
                    detailChartSectionEl.hidden = true;
                }
                setChartMessage('');
                if (detailChartStyleSelectEl) {
                    detailChartStyleSelectEl.disabled = false;
                }
                return;
            }
            chartSourceData = prepareChartSourceData(reviewData, entries);
            if (!chartSourceData.labels.length) {
                chartSourceData = null;
                destroyDetailChart();
                detailChartSectionEl.hidden = false;
                setChartMessage('No hay puntuaciones suficientes para dibujar la gráfica.');
                if (detailChartStyleSelectEl) {
                    detailChartStyleSelectEl.disabled = true;
                }
                return;
            }
            setChartMessage('');
            renderDetailChart(detailChartStyleSelectEl?.value || 'radar');
        };

        if (detailChartStyleSelectEl) {
            detailChartStyleSelectEl.addEventListener('change', () => {
                const selectedStyle = detailChartStyleSelectEl.value;
                renderDetailChart(selectedStyle);
            });
        }

        const showDetailImage = (url, altText) => {
            if (!detailImageEl) {
                return;
            }
            if (url) {
                detailImageEl.src = url;
                if (altText) {
                    detailImageEl.alt = altText;
                }
                detailImageEl.style.display = 'block';
                const placeholderIcon = detailImageEl.parentNode?.querySelector('.detail-image-icon-placeholder');
                if (placeholderIcon) {
                    placeholderIcon.style.display = 'none';
                }
            }
        };

        const showImagePlaceholder = () => {
            if (!detailImageEl || !detailImageEl.parentNode) {
                return;
            }
            detailImageEl.style.display = 'none';
            let placeholderIconDiv = detailImageEl.parentNode.querySelector('.detail-image-icon-placeholder');
            if (!placeholderIconDiv) {
                placeholderIconDiv = document.createElement('div');
                placeholderIconDiv.className = 'detail-image-icon-placeholder';
                detailImageEl.parentNode.insertBefore(placeholderIconDiv, detailImageEl.nextSibling);
            }
            placeholderIconDiv.innerHTML = '<i class="fa-solid fa-image"></i>';
            placeholderIconDiv.style.display = 'flex';
        };

        const updateReviewDate = (rawDateValue) => {
            if (!reviewCreatedDateEl || !reviewDateContainerEl) {
                return;
            }
            const date = coerceToDate(rawDateValue);
            if (!date) {
                reviewDateContainerEl.hidden = true;
                return;
            }
            const formatted = formatDateForDisplay(date);
            if (!formatted) {
                reviewDateContainerEl.hidden = true;
                return;
            }
            reviewCreatedDateEl.textContent = `Creada el ${formatted}`;
            reviewDateContainerEl.hidden = false;
        };

        const ensureShareData = () => {
            const baseData = {
                listId: listIdFromURL || '',
                reviewId: reviewId || '',
                detailUrl: shareDetailUrl
            };
            if (!shareModalData) {
                shareModalData = baseData;
            } else {
                shareModalData = { ...baseData, ...shareModalData };
            }
            if (shareButton) {
                const hasCoreData = Boolean(shareModalData.listId && shareModalData.reviewId);
                shareButton.disabled = !hasCoreData;
            }
        };

        const updateShareData = (partial = {}) => {
            shareModalData = { ...(shareModalData || {}), ...partial };
            ensureShareData();
        };

        const shareLinkFallback = async (detailUrl) => {
            try {
                const absoluteUrl = detailUrl ? new URL(detailUrl, window.location.href).href : window.location.href;
                if (navigator.share) {
                    await navigator.share({ title: 'Listopic', url: absoluteUrl });
                    return true;
                }
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(absoluteUrl);
                    return true;
                }
                window.prompt('Copia el enlace de la reseña:', absoluteUrl);
                return true;
            } catch (error) {
                console.error('[detailView] Error en compartir fallback:', error);
                return false;
            }
        };

        const handleShareButtonClick = async () => {
            ensureShareData();
            if (!shareModalData || !shareModalData.listId || !shareModalData.reviewId) {
                return;
            }
            if (window.ListopicApp?.reviewShare?.open) {
                window.ListopicApp.reviewShare.open(shareModalData);
                return;
            }
            const success = await shareLinkFallback(shareModalData.detailUrl);
            if (success && typeof showNotification === 'function') {
                showNotification('Enlace preparado para compartir.', 'success');
            } else if (!success && typeof showNotification === 'function') {
                showNotification('No se pudo compartir la reseña.', 'error');
            }
        };

        if (shareButton) {
            shareButton.disabled = true;
            shareButton.addEventListener('click', handleShareButtonClick);
        }

        // Configurar boton de Volver
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
            const errorMsg = "Error: Falta ID de resena o ID de lista en la URL.";
            console.error("DETAIL-VIEW:", errorMsg);
            if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = errorMsg;
            if (ListopicApp.services && ListopicApp.services.showNotification) {
                ListopicApp.services.showNotification(errorMsg, "error");
            }
            return;
        }

        const shareDetailUrl = (() => {
            const query = new URLSearchParams();
            if (reviewId) query.set('id', reviewId);
            if (listIdFromURL) query.set('listId', listIdFromURL);
            const queryString = query.toString();
            return queryString ? `detail-view.html?${queryString}` : 'detail-view.html';
        })();

        let reviewDataGlobal;
        let listDataGlobal; // Lo hacemos accesible en un scope mas amplio

        // 1. Obtener la resena
        db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
            .then(reviewDoc => {
                if (!reviewDoc.exists) throw new Error(`Resena no encontrada.`);
                reviewDataGlobal = { id: reviewDoc.id, ...reviewDoc.data() };
                const authorNameRaw = reviewDataGlobal.authorName || reviewDataGlobal.userDisplayName || reviewDataGlobal.username || 'Usuario Anonimo';
                displayPhotoUrl = reviewDataGlobal.photoUrl || reviewDataGlobal.imageUrl || '';
                awaitingFallbackImage = !displayPhotoUrl;

                updateReviewDate(
                    reviewDataGlobal.createdAt ||
                    reviewDataGlobal.creationDate ||
                    reviewDataGlobal.created_at ||
                    reviewDataGlobal.createdOn ||
                    reviewDataGlobal.updatedAt ||
                    reviewDataGlobal.updated_at ||
                    reviewDataGlobal.lastUpdated
                );

                updateShareData({
                    reviewId: reviewDataGlobal.id || reviewId,
                    listId: listIdFromURL,
                    itemName: reviewDataGlobal.itemName || '',
                    overallRating: Number.isFinite(Number(reviewDataGlobal.overallRating))
                        ? Number(reviewDataGlobal.overallRating).toFixed(1)
                        : '',
                    photoUrl: displayPhotoUrl,
                    comment: reviewDataGlobal.comment || '',
                    placeId: reviewDataGlobal.placeId || '',
                    placeName: reviewDataGlobal.establishmentName || '',
                    authorId: reviewDataGlobal.userId || null,
                    authorName: authorNameRaw,
                    detailUrl: shareDetailUrl
                });
                const isOwner = Boolean(currentUserId && (reviewDataGlobal.userId === currentUserId || reviewDataGlobal.authorId === currentUserId));
                if (isOwner) {
                    updateShareData({ isOwner: true });
                }

                if (editButton) {
                    editButton.style.display = isOwner ? '' : 'none';
                    if (isOwner) {
                        editButton.removeAttribute('aria-hidden');
                        editButton.removeAttribute('tabindex');
                    } else {
                        editButton.setAttribute('aria-hidden', 'true');
                        editButton.setAttribute('tabindex', '-1');
                    }
                }
                if (deleteButton) {
                    deleteButton.style.display = isOwner ? '' : 'none';
                    if (isOwner) {
                        deleteButton.removeAttribute('aria-hidden');
                        deleteButton.removeAttribute('tabindex');
                    } else {
                        deleteButton.setAttribute('aria-hidden', 'true');
                        deleteButton.setAttribute('tabindex', '-1');
                    }
                }

                // Mostrar datos basicos de la resena
                if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                
                if (detailImageEl && detailImageEl.parentNode) {
                    if (displayPhotoUrl) {
                        showDetailImage(displayPhotoUrl, `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || 'reseña')}`);
                    } else {
                        showImagePlaceholder();
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

                if (reviewAuthorAvatarEl) {
                    const avatarFallback = reviewDataGlobal.authorPhotoUrl || reviewDataGlobal.userPhotoUrl || '';
                    reviewAuthorAvatarEl.src = avatarFallback || reviewAuthorAvatarEl.src || 'img/default-avatar.png';
                    reviewAuthorAvatarEl.alt = reviewAuthorAvatarEl.alt || 'Avatar del autor';
                }

                if (detailPlaceLinkEl) {
                    const placeTextNode = detailPlaceLinkEl.querySelector('#detail-place-text');
                    const fallbackPlaceName = reviewDataGlobal.establishmentName || 'Lugar sin especificar';
                    if (placeTextNode) {
                        placeTextNode.textContent = fallbackPlaceName;
                    } else {
                        detailPlaceLinkEl.textContent = fallbackPlaceName;
                    }
                    if (reviewDataGlobal.placeId) {
                        detailPlaceLinkEl.href = `place-detail.html?placeId=${encodeURIComponent(reviewDataGlobal.placeId)}`;
                        detailPlaceLinkEl.classList.remove('detail-place__link--disabled');
                        detailPlaceLinkEl.removeAttribute('aria-disabled');
                    } else {
                        detailPlaceLinkEl.removeAttribute('href');
                        detailPlaceLinkEl.classList.add('detail-place__link--disabled');
                        detailPlaceLinkEl.setAttribute('aria-disabled', 'true');
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

                // 2. Obtener la definicion de la lista
                return db.collection('lists').doc(listIdFromURL).get();
            })
            .then(listDoc => {
                if (!listDoc.exists) throw new Error("Lista asociada no encontrada.");
                listDataGlobal = listDoc.data(); // Guardar en el scope mas amplio
                state.currentListCriteriaDefinitions = listDataGlobal.criteriaDefinitions || listDataGlobal.defaultCriteriaDefinitions || {};
                updateShareData({
                    listName: listDataGlobal.name || '',
                    detailUrl: shareDetailUrl
                });

                if (detailListNameEl && listDataGlobal.name) {
                    detailListNameEl.innerHTML = `Estas viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listDataGlobal.name)}</a>`;
                    if (uiUtils.updatePageHeaderInfo) { // Actualizar header comun
                        const currentCategory = listDataGlobal.categoryId || "Hmm...";
                        uiUtils.updatePageHeaderInfo(currentCategory, listDataGlobal.name);
                    }
                } else if (detailListNameEl) {
                    detailListNameEl.textContent = "Estas viendo en Listopic: Lista Desconocida";
                    if (uiUtils.updatePageHeaderInfo) uiUtils.updatePageHeaderInfo();
                }

                // Renderizar valoraciones detalladas
                let chartCriteriaEntries = [];
                if (detailRatingsListEl && reviewDataGlobal && reviewDataGlobal.scores) {
                    detailRatingsListEl.innerHTML = '';
                    let hasAnyRating = false;
                    if (typeof state.currentListCriteriaDefinitions === 'object' && Object.keys(state.currentListCriteriaDefinitions).length > 0) {
                        for (const [critKey, critDef] of Object.entries(state.currentListCriteriaDefinitions)) {
                            if (reviewDataGlobal.scores[critKey] === undefined) {
                                continue;
                            }
                            const numericScore = Number.parseFloat(reviewDataGlobal.scores[critKey]);
                            if (!Number.isFinite(numericScore)) {
                                continue;
                            }
                            const li = document.createElement('li');
                            const weightedText = critDef.ponderable === false ? ' <small class="non-weighted-detail">(No pondera)</small>' : '';
                            const labelText = getCriterionLabel(critDef, critKey);
                            li.innerHTML = `<span class="rating-label">${uiUtils.escapeHtml(labelText)}${weightedText}</span> <span class="rating-value">${numericScore.toFixed(1)}</span>`;
                            detailRatingsListEl.appendChild(li);
                            chartCriteriaEntries.push([critKey, critDef]);
                            hasAnyRating = true;
                        }
                    } else {
                        const fallbackEntries = Object.entries(reviewDataGlobal.scores || {});
                        for (const [critKey, rawScore] of fallbackEntries) {
                            const numericScore = Number.parseFloat(rawScore);
                            if (!Number.isFinite(numericScore)) {
                                continue;
                            }
                            const li = document.createElement('li');
                            li.innerHTML = `<span class="rating-label">${uiUtils.escapeHtml(critKey)}</span> <span class="rating-value">${numericScore.toFixed(1)}</span>`;
                            detailRatingsListEl.appendChild(li);
                            chartCriteriaEntries.push([critKey, { label: critKey, min: 0, max: 10 }]);
                            hasAnyRating = true;
                        }
                    }
                    if (!hasAnyRating) {
                        detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas disponibles.</li>';
                    }
                } else if (detailRatingsListEl) {
                    detailRatingsListEl.innerHTML = '<li>No hay valoraciones detalladas disponibles.</li>';
                }
                updateDetailChart(reviewDataGlobal, chartCriteriaEntries);

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
                    const authorRaw = userData.username || userData.displayName || 'Usuario Anonimo';
                    const authorName = uiUtils.escapeHtml(authorRaw);

                    updateShareData({ authorName: authorRaw });

                    const authorLink = document.createElement('a');
                    authorLink.href = `profile.html?viewUserId=${reviewDataGlobal.userId}`;
                    authorLink.textContent = authorName;

                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.innerHTML = '';
                        reviewAuthorNameEl.appendChild(authorLink);
                    }
                    if (reviewAuthorAvatarEl) {
                        const avatarSource = userData.photoUrl || reviewDataGlobal.authorPhotoUrl || reviewDataGlobal.userPhotoUrl || '';
                        if (avatarSource) {
                            reviewAuthorAvatarEl.src = avatarSource;
                        } else {
                            reviewAuthorAvatarEl.src = 'img/default-avatar.png';
                        }
                        const safeAuthorAlt = String(authorRaw || 'autor de la reseña').replace(/[<>"']/g, '');
                        reviewAuthorAvatarEl.alt = `Avatar de ${safeAuthorAlt}`;
                    }
                } else if (reviewDataGlobal.userId && reviewAuthorNameEl) {
                    reviewAuthorNameEl.textContent = 'Usuario Desconocido';
                    console.warn(`Autor de reseña con ID ${reviewDataGlobal.userId} no encontrado.`);
                    if (reviewAuthorAvatarEl) {
                        const avatarFallback = reviewDataGlobal.authorPhotoUrl || reviewDataGlobal.userPhotoUrl || '';
                        reviewAuthorAvatarEl.src = avatarFallback || 'img/default-avatar.png';
                        reviewAuthorAvatarEl.alt = 'Avatar del autor';
                    }
                }
                
                // 4. Si la reseña tiene placeId, obtener datos del lugar
                if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    return db.collection('places').doc(reviewDataGlobal.placeId).get(); // Esto devuelve una promesa
                }

                // No hay placeId, mostrar N/A y resolver para finalizar cadena si es necesario
                if (detailEstablishmentNameEl) {
                    detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado";
                }
                if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                if (detailLocationLinkEl) {
                    detailLocationLinkEl.removeAttribute('href');
                    detailLocationLinkEl.style.pointerEvents = 'none';
                }
                setNoLocationVisible(true);
                updateShareData({ placeId: '', placeName: reviewDataGlobal.establishmentName || '' });
                return Promise.resolve(null); // Devolver promesa resuelta
            })
            .then(placeDocOrNull => { // placeDocOrNull es el resultado de la promesa del lugar
                let placeData = null;
                if (placeDocOrNull && placeDocOrNull.exists) {
                    placeData = placeDocOrNull.data();
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = placeData.name || "Nombre de lugar desconocido";

                    if (detailPlaceLinkEl) {
                        const placeTextNode = detailPlaceLinkEl.querySelector('#detail-place-text');
                        const resolvedPlaceName = placeData.name || reviewDataGlobal.establishmentName || 'Lugar sin especificar';
                        if (placeTextNode) {
                            placeTextNode.textContent = resolvedPlaceName;
                        } else {
                            detailPlaceLinkEl.textContent = resolvedPlaceName;
                        }
                        const resolvedPlaceId = placeDocOrNull.id || reviewDataGlobal.placeId || placeData.id;
                        if (resolvedPlaceId) {
                            detailPlaceLinkEl.href = `place-detail.html?placeId=${encodeURIComponent(resolvedPlaceId)}`;
                            detailPlaceLinkEl.classList.remove('detail-place__link--disabled');
                            detailPlaceLinkEl.removeAttribute('aria-disabled');
                        } else {
                            detailPlaceLinkEl.removeAttribute('href');
                            detailPlaceLinkEl.classList.add('detail-place__link--disabled');
                            detailPlaceLinkEl.setAttribute('aria-disabled', 'true');
                        }
                    }

                    if (!displayPhotoUrl && awaitingFallbackImage) {
                        const placePhotoFallback = getPreferredPhotoUrl(reviewDataGlobal, placeData);
                        if (placePhotoFallback) {
                            displayPhotoUrl = placePhotoFallback;
                            awaitingFallbackImage = false;
                            showDetailImage(displayPhotoUrl, `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || placeData.name || 'reseña')}`);
                            updateShareData({ photoUrl: displayPhotoUrl });
                        }
                    }

                    if (detailLocationContainerEl && detailLocationTextEl && (placeData.address || placeData.name || placeData.googleMapsUrl || placeData.googlePlaceId)) {
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
                        setNoLocationVisible(false);
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'block';
                    } else {
                        if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                        if (detailLocationLinkEl) {
                            detailLocationLinkEl.removeAttribute('href');
                            detailLocationLinkEl.style.pointerEvents = 'none';
                        }
                        setNoLocationVisible(true);
                    }
                } else if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Lugar no encontrado en BD";
                    console.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                    if (detailLocationContainerEl) detailLocationContainerEl.style.display = 'none';
                    if (detailLocationLinkEl) {
                        detailLocationLinkEl.removeAttribute('href');
                        detailLocationLinkEl.style.pointerEvents = 'none';
                    }
                    setNoLocationVisible(true);
                    if (detailPlaceLinkEl) {
                        detailPlaceLinkEl.classList.add('detail-place__link--disabled');
                        detailPlaceLinkEl.setAttribute('aria-disabled', 'true');
                    }
                }
                const placeNameForShare = placeData?.name || reviewDataGlobal.establishmentName || '';
                updateShareData({
                    placeId: reviewDataGlobal?.placeId || placeData?.id || '',
                    placeName: placeNameForShare
                });
                // Si placeDocOrNull es null, ya se manejo el caso sin placeId antes
            })
            .catch(error => {
                console.error("Error fetching details for detail view:", error);
                if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar datos";
                if (ListopicApp.services && ListopicApp.services.showNotification) {
                     ListopicApp.services.showNotification(error.message || "Error al cargar los detalles.", "error");
                }
                if (shareButton) {
                    shareButton.disabled = true;
                }
            });

        // Listener para el boton de eliminar
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
