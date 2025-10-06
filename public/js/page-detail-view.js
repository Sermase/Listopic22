window.ListopicApp = window.ListopicApp || {};
ListopicApp.pageDetailView = (() => {
    const STORY_DEFAULT_CUSTOMIZATION = {
        colorScheme: 'midnight',
        graphicStyle: 'bars'
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
                const label = (definition?.label || key).toString();
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
                const label = (definition?.label || key).toString();
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
        const fromPlaceIdParam = params.get('fromPlaceId');
        const fromItemParam = params.get('fromItem');
        const fromGroupedParam = params.get('fromGrouped') === 'true';

        // Elementos del DOM
        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name');
        const detailItemNameEl = document.getElementById('detail-dish-name');
        const detailScoreValueEl = document.getElementById('detail-score-value');
        const detailRatingsListEl = document.getElementById('detail-ratings');
        const detailLocationLinkEl = document.getElementById('detail-location-link');
        const detailLocationTextEl = document.getElementById('detail-location-text');
        const detailLocationContainerEl = document.getElementById('detail-location-container');
        const detailNoLocationEl = document.getElementById('detail-no-location');
        const detailCommentContainerEl = document.getElementById('detail-comment-container');
        const detailCommentTextEl = document.getElementById('detail-comment-text');
        const detailTagsContainerEl = document.getElementById('detail-tags-container');
        const detailTagsDivEl = document.getElementById('detail-tags');
        const detailListNameEl = document.getElementById('detail-list-name');
        const detailListLinkEl = document.getElementById('detail-list-link');
        const detailPlaceLinkWrapperEl = document.getElementById('detail-place-link-wrapper');
        const detailPlaceLinkEl = document.getElementById('detail-place-link');
        const detailGroupLinkEl = document.getElementById('detail-group-link');
        const detailMediaLinkEl = document.getElementById('detail-media-link');
        const detailReviewDateContainerEl = document.getElementById('detail-review-date');
        const detailReviewDateTextEl = document.getElementById('detail-review-date-text');
        const reviewAuthorNameEl = document.getElementById('review-author-name');
        const reviewAuthorLinkEl = document.getElementById('review-author-link');
        const reviewAuthorAvatarEl = document.getElementById('review-author-avatar');
        const reviewAuthorBioEl = document.getElementById('review-author-bio');
        const detailImageEl = document.getElementById('detail-image');
        const detailImagePlaceholderEl = document.querySelector('.detail-image-icon-placeholder');

        const backButton = document.querySelector('.container a.back-button');
        const editButton = document.querySelector('.edit-button[data-owner-action]');
        const deleteButton = document.querySelector('.delete-button.danger[data-owner-action]');
        const ownerActionEls = Array.from(document.querySelectorAll('[data-owner-action]'));
        const sharePrimaryButton = document.getElementById('detail-share-button');
        const shareSecondaryButton = document.getElementById('detail-share-button-secondary');
        const shareButtons = [sharePrimaryButton, shareSecondaryButton].filter(Boolean);
        const showNotification = ListopicApp.services?.showNotification;
        const currentUserId = auth?.currentUser?.uid || null;

        const chartCanvas = document.getElementById('detail-criteria-canvas');
        const chartEmptyStateEl = document.getElementById('detail-criteria-empty');
        const chartToggleButtons = Array.from(document.querySelectorAll('.chart-mode-toggle__button'));

        let shareModalData = null;

        const chartState = {
            mode: 'bars',
            entries: [],
            resizeTimeout: null
        };

        const getCssColor = (variableName, fallback) => {
            if (typeof window === 'undefined' || !window.getComputedStyle) {
                return fallback;
            }
            const styles = window.getComputedStyle(document.documentElement);
            const value = styles.getPropertyValue(variableName);
            return value ? value.trim() || fallback : fallback;
        };

        const chartColors = {
            accent: getCssColor('--accent-color-primary', '#f97316'),
            accentSecondary: getCssColor('--accent-color-secondary', '#facc15'),
            accentTertiary: getCssColor('--accent-color-tertiary', '#06d6a0'),
            track: 'rgba(255,255,255,0.14)',
            panel: 'rgba(15,23,42,0.55)',
            text: '#ffffff',
            muted: 'rgba(255,255,255,0.7)'
        };

        const setShareButtonsEnabled = (enabled) => {
            shareButtons.forEach(button => {
                if (!button) return;
                button.disabled = !enabled;
                if (!enabled) {
                    button.removeAttribute('data-loading');
                    button.removeAttribute('aria-busy');
                }
            });
        };

        const updateOwnerActionsVisibility = (isOwner) => {
            ownerActionEls.forEach(element => {
                if (!element) {
                    return;
                }
                element.hidden = !isOwner;
            });
        };

        updateOwnerActionsVisibility(false);

        const renderAuthorAvatar = (photoUrl, name) => {
            if (!reviewAuthorAvatarEl) {
                return;
            }
            reviewAuthorAvatarEl.innerHTML = '';
            if (photoUrl) {
                const img = document.createElement('img');
                img.src = photoUrl;
                img.alt = name ? `Foto de ${name}` : 'Foto del autor';
                reviewAuthorAvatarEl.appendChild(img);
                return;
            }
            const initials = getAuthorInitials(name || '');
            reviewAuthorAvatarEl.textContent = initials || '??';
        };

        const formatReviewDate = (rawDate) => {
            if (!rawDate) {
                return '';
            }
            let value = rawDate;
            if (typeof rawDate.toDate === 'function') {
                value = rawDate.toDate();
            }
            if (!(value instanceof Date)) {
                return '';
            }
            try {
                return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(value);
            } catch (error) {
                console.warn('[detailView] No se pudo formatear la fecha de la reseña.', error);
                return value.toLocaleDateString?.() || '';
            }
        };

        const prepareCanvasContext = (canvas, width, height) => {
            if (!canvas) {
                return null;
            }
            const ratio = window.devicePixelRatio || 1;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return null;
            }
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, width, height);
            return ctx;
        };

        const drawBarsChart = (entries) => {
            if (!chartCanvas || !entries.length) {
                return;
            }
            const containerWidth = chartCanvas.parentElement?.clientWidth || 600;
            const barHeight = 34;
            const barSpacing = 20;
            const chartHeight = Math.max(200, entries.length * (barHeight + barSpacing) + 40);
            const ctx = prepareCanvasContext(chartCanvas, containerWidth, chartHeight);
            if (!ctx) {
                return;
            }

            ctx.font = '16px "Poppins", "Helvetica Neue", Arial';
            ctx.textBaseline = 'middle';

            const paddingX = 24;
            const barMaxWidth = containerWidth - paddingX * 2;

            entries.forEach((entry, index) => {
                const top = 30 + index * (barHeight + barSpacing);
                const normalized = entry.max > entry.min
                    ? (entry.value - entry.min) / (entry.max - entry.min)
                    : entry.value / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const barWidth = Math.max(4, barMaxWidth * clamped);

                ctx.fillStyle = chartColors.track;
                drawRoundedRectPath(ctx, paddingX, top, barMaxWidth, barHeight, 14);
                ctx.fill();

                const gradient = ctx.createLinearGradient(paddingX, top, paddingX + barWidth, top + barHeight);
                gradient.addColorStop(0, chartColors.accent);
                gradient.addColorStop(1, chartColors.accentSecondary);
                ctx.fillStyle = gradient;
                drawRoundedRectPath(ctx, paddingX, top, barWidth, barHeight, 14);
                ctx.fill();

                ctx.fillStyle = chartColors.text;
                ctx.textAlign = 'left';
                const label = entry.ponderable === false ? `${entry.label} (no pondera)` : entry.label;
                ctx.fillText(label, paddingX + 12, top + barHeight / 2);

                ctx.fillStyle = chartColors.muted;
                ctx.textAlign = 'right';
                ctx.fillText(entry.value.toFixed(1), paddingX + barMaxWidth - 8, top + barHeight / 2);
            });
        };

        const drawRadarChart = (entries) => {
            if (!chartCanvas || !entries.length) {
                return;
            }
            const containerWidth = chartCanvas.parentElement?.clientWidth || 520;
            const size = Math.min(520, Math.max(320, containerWidth));
            const ctx = prepareCanvasContext(chartCanvas, size, size);
            if (!ctx) {
                return;
            }

            const centerX = size / 2;
            const centerY = size / 2;
            const radius = Math.min(size / 2 - 50, 220);
            const levels = 5;
            const angleStep = (Math.PI * 2) / entries.length;

            ctx.strokeStyle = hexToRgba(chartColors.accentSecondary, 0.25);
            ctx.lineWidth = 1.5;
            for (let level = 1; level <= levels; level += 1) {
                const ratio = level / levels;
                ctx.beginPath();
                entries.forEach((entry, index) => {
                    const angle = angleStep * index - Math.PI / 2;
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

            ctx.strokeStyle = hexToRgba(chartColors.accentTertiary, 0.5);
            entries.forEach((entry, index) => {
                const angle = angleStep * index - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
                ctx.stroke();
            });

            ctx.beginPath();
            entries.forEach((entry, index) => {
                const normalized = entry.max > entry.min
                    ? (entry.value - entry.min) / (entry.max - entry.min)
                    : entry.value / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const angle = angleStep * index - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius * clamped;
                const y = centerY + Math.sin(angle) * radius * clamped;
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();
            ctx.fillStyle = hexToRgba(chartColors.accent, 0.32);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = chartColors.accent;
            ctx.stroke();

            entries.forEach((entry, index) => {
                const normalized = entry.max > entry.min
                    ? (entry.value - entry.min) / (entry.max - entry.min)
                    : entry.value / 10;
                const clamped = Math.max(0, Math.min(1, normalized));
                const angle = angleStep * index - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius * clamped;
                const y = centerY + Math.sin(angle) * radius * clamped;
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fillStyle = chartColors.text;
                ctx.fill();
            });

            ctx.font = '14px "Poppins", "Helvetica Neue", Arial';
            entries.forEach((entry, index) => {
                const angle = angleStep * index - Math.PI / 2;
                const labelRadius = radius + 28;
                const x = centerX + Math.cos(angle) * labelRadius;
                const y = centerY + Math.sin(angle) * labelRadius;

                const align = Math.cos(angle) > 0.2 ? 'left' : Math.cos(angle) < -0.2 ? 'right' : 'center';
                ctx.textAlign = align;
                ctx.textBaseline = 'middle';
                ctx.fillStyle = chartColors.text;
                ctx.fillText(entry.label, x, y);
                ctx.fillStyle = chartColors.muted;
                ctx.fillText(entry.value.toFixed(1), x, y + 18);
            });
        };

        const updateChartModeButtons = () => {
            chartToggleButtons.forEach(button => {
                const mode = button?.dataset?.chartMode || 'bars';
                const isActive = chartState.mode === mode;
                if (chartState.entries.length < 3 && mode === 'radar') {
                    button.disabled = true;
                    button.classList.remove('is-active');
                    button.setAttribute('aria-pressed', 'false');
                    return;
                }
                button.disabled = false;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });
        };

        const renderCriteriaChart = () => {
            if (!chartCanvas) {
                return;
            }
            if (!chartState.entries.length) {
                chartCanvas.style.display = 'none';
                if (chartEmptyStateEl) chartEmptyStateEl.hidden = false;
                return;
            }
            chartCanvas.style.display = 'block';
            if (chartEmptyStateEl) chartEmptyStateEl.hidden = true;
            const usableEntries = chartState.mode === 'radar'
                ? chartState.entries.slice(0, 6)
                : chartState.entries;
            if (chartState.mode === 'radar' && usableEntries.length < 3) {
                chartState.mode = 'bars';
                updateChartModeButtons();
                drawBarsChart(chartState.entries);
                return;
            }
            if (chartState.mode === 'radar') {
                drawRadarChart(usableEntries);
            } else {
                drawBarsChart(usableEntries);
            }
        };

        const updateChartEntries = (entries) => {
            chartState.entries = entries.slice();
            updateChartModeButtons();
            renderCriteriaChart();
        };

        const setChartMode = (mode) => {
            if (mode === 'radar' && chartState.entries.length < 3) {
                return;
            }
            chartState.mode = mode === 'radar' ? 'radar' : 'bars';
            updateChartModeButtons();
            renderCriteriaChart();
        };

        chartToggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const mode = button?.dataset?.chartMode || 'bars';
                setChartMode(mode);
            });
        });

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                if (chartState.resizeTimeout) {
                    window.clearTimeout(chartState.resizeTimeout);
                }
                chartState.resizeTimeout = window.setTimeout(() => {
                    renderCriteriaChart();
                }, 150);
            });
        }

        const computeCriteriaEntries = () => {
            if (!reviewDataGlobal?.scores || typeof reviewDataGlobal.scores !== 'object') {
                return [];
            }
            const entries = [];
            const definitions = state.currentListCriteriaDefinitions;
            if (definitions && Object.keys(definitions).length > 0) {
                for (const [key, definition] of Object.entries(definitions)) {
                    if (reviewDataGlobal.scores[key] === undefined) {
                        continue;
                    }
                    const value = Number.parseFloat(reviewDataGlobal.scores[key]);
                    if (!Number.isFinite(value)) {
                        continue;
                    }
                    entries.push({
                        key,
                        label: definition?.label || key,
                        value,
                        min: Number.isFinite(Number.parseFloat(definition?.min)) ? Number.parseFloat(definition.min) : 0,
                        max: Number.isFinite(Number.parseFloat(definition?.max)) ? Number.parseFloat(definition.max) : 10,
                        ponderable: definition?.ponderable !== false
                    });
                }
            } else {
                for (const [key, rawValue] of Object.entries(reviewDataGlobal.scores)) {
                    const value = Number.parseFloat(rawValue);
                    if (!Number.isFinite(value)) {
                        continue;
                    }
                    entries.push({
                        key,
                        label: key,
                        value,
                        min: 0,
                        max: 10,
                        ponderable: true
                    });
                }
            }
            return entries;
        };

        const renderRatingsList = (entries) => {
            if (!detailRatingsListEl) {
                return;
            }
            detailRatingsListEl.innerHTML = '';
            if (!entries.length) {
                const emptyItem = document.createElement('li');
                emptyItem.textContent = 'No hay valoraciones detalladas disponibles.';
                detailRatingsListEl.appendChild(emptyItem);
                return;
            }
            entries.forEach(entry => {
                const li = document.createElement('li');
                const labelSpan = document.createElement('span');
                labelSpan.className = 'rating-label';
                labelSpan.textContent = entry.label;
                if (entry.ponderable === false) {
                    const info = document.createElement('small');
                    info.className = 'non-weighted-detail';
                    info.textContent = ' (no pondera)';
                    labelSpan.appendChild(info);
                }
                const valueSpan = document.createElement('span');
                valueSpan.className = 'rating-value';
                valueSpan.textContent = entry.value.toFixed(1);
                li.appendChild(labelSpan);
                li.appendChild(valueSpan);
                detailRatingsListEl.appendChild(li);
            });
        };

        const refreshCriteriaVisuals = () => {
            const entries = computeCriteriaEntries();
            renderRatingsList(entries);
            updateChartEntries(entries);
        };

        const buildGroupLinkUrl = (placeId, itemName) => {
            if (!listIdFromURL || !placeId) {
                return null;
            }
            const query = new URLSearchParams({ listId: listIdFromURL, placeId });
            if (itemName) {
                query.set('item', itemName);
            }
            return `grouped-detail-view.html?${query.toString()}`;
        };

        const applyGroupLink = () => {
            if (!detailGroupLinkEl || !detailMediaLinkEl) {
                return;
            }
            if (groupLinkUrl) {
                detailGroupLinkEl.href = groupLinkUrl;
                detailGroupLinkEl.hidden = false;
                detailGroupLinkEl.setAttribute('aria-label', 'Ver grupo del plato');
                detailMediaLinkEl.href = groupLinkUrl;
                detailMediaLinkEl.hidden = false;
                detailMediaLinkEl.target = '_self';
                detailMediaLinkEl.setAttribute('aria-label', 'Abrir el grupo del plato');
            } else {
                detailGroupLinkEl.hidden = true;
                detailGroupLinkEl.removeAttribute('href');
                detailGroupLinkEl.removeAttribute('target');
                if (reviewDataGlobal?.photoUrl) {
                    detailMediaLinkEl.href = reviewDataGlobal.photoUrl;
                    detailMediaLinkEl.hidden = false;
                    detailMediaLinkEl.target = '_blank';
                    detailMediaLinkEl.setAttribute('aria-label', 'Abrir la foto de la reseña en una pestaña nueva');
                } else {
                    detailMediaLinkEl.hidden = true;
                    detailMediaLinkEl.removeAttribute('href');
                }
            }
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
            const hasCoreData = Boolean(shareModalData.listId && shareModalData.reviewId);
            setShareButtonsEnabled(hasCoreData);
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

        shareButtons.forEach(button => {
            button.disabled = true;
            button.addEventListener('click', handleShareButtonClick);
        });

        // Configurar boton de Volver
        if (backButton && listIdFromURL) {
            if (fromGroupedParam && fromPlaceIdParam) {
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
        let placeDataGlobal;
        let groupLinkUrl = null;

        // 1. Obtener la resena
        db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
            .then(reviewDoc => {
                if (!reviewDoc.exists) throw new Error(`Resena no encontrada.`);
                reviewDataGlobal = { id: reviewDoc.id, ...reviewDoc.data() };
                const authorNameRaw = reviewDataGlobal.authorName || reviewDataGlobal.userDisplayName || reviewDataGlobal.username || 'Usuario Anonimo';
                updateShareData({
                    reviewId: reviewDataGlobal.id || reviewId,
                    listId: listIdFromURL,
                    itemName: reviewDataGlobal.itemName || '',
                    overallRating: Number.isFinite(Number(reviewDataGlobal.overallRating))
                        ? Number(reviewDataGlobal.overallRating).toFixed(1)
                        : '',
                    photoUrl: reviewDataGlobal.photoUrl || '',
                    comment: reviewDataGlobal.comment || '',
                    placeId: reviewDataGlobal.placeId || '',
                    placeName: reviewDataGlobal.establishmentName || '',
                    authorId: reviewDataGlobal.userId || null,
                    authorName: authorNameRaw,
                    detailUrl: shareDetailUrl
                });
                if (currentUserId && (reviewDataGlobal.userId === currentUserId || reviewDataGlobal.authorId === currentUserId)) {
                    updateShareData({ isOwner: true });
                    updateOwnerActionsVisibility(true);
                } else {
                    updateOwnerActionsVisibility(false);
                }

                // Mostrar datos basicos de la resena
                if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                
                if (detailEstablishmentNameEl) {
                    detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || reviewDataGlobal.placeName || 'Lugar no especificado';
                }

                if (detailItemNameEl) {
                    detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                }

                if (detailImageEl) {
                    if (reviewDataGlobal.photoUrl) {
                        detailImageEl.src = reviewDataGlobal.photoUrl;
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || reviewDataGlobal.establishmentName || 'la reseña')}`;
                        detailImageEl.hidden = false;
                        if (detailImagePlaceholderEl) detailImagePlaceholderEl.hidden = true;
                        if (detailMediaLinkEl) {
                            detailMediaLinkEl.href = reviewDataGlobal.photoUrl;
                            detailMediaLinkEl.hidden = false;
                            detailMediaLinkEl.setAttribute('aria-label', 'Abrir la foto de la reseña en una pestaña nueva');
                            detailMediaLinkEl.target = '_blank';
                        }
                    } else {
                        detailImageEl.hidden = true;
                        if (detailImagePlaceholderEl) detailImagePlaceholderEl.hidden = false;
                        if (detailMediaLinkEl) {
                            detailMediaLinkEl.hidden = true;
                            detailMediaLinkEl.removeAttribute('href');
                        }
                    }
                }

                if (detailCommentContainerEl && detailCommentTextEl) {
                    if (reviewDataGlobal.comment) {
                        detailCommentTextEl.innerHTML = uiUtils.escapeHtml(reviewDataGlobal.comment).replace(/\n/g, '<br>');
                        detailCommentContainerEl.hidden = false;
                    } else {
                        detailCommentContainerEl.hidden = true;
                    }
                }

                if (detailTagsContainerEl && detailTagsDivEl) {
                    if (Array.isArray(reviewDataGlobal.userTags) && reviewDataGlobal.userTags.length > 0) {
                        detailTagsDivEl.innerHTML = reviewDataGlobal.userTags.map(tag => `<span class="tag-detail">${uiUtils.escapeHtml(tag)}</span>`).join('');
                        detailTagsContainerEl.hidden = false;
                    } else {
                        detailTagsContainerEl.hidden = true;
                        detailTagsDivEl.innerHTML = '';
                    }
                }

                const reviewTimestamp = reviewDataGlobal.updatedAt || reviewDataGlobal.updated_at || reviewDataGlobal.createdAt || reviewDataGlobal.created_at || null;
                const reviewDateText = formatReviewDate(reviewTimestamp);
                if (detailReviewDateContainerEl && detailReviewDateTextEl) {
                    if (reviewDateText) {
                        detailReviewDateTextEl.textContent = reviewDateText;
                        detailReviewDateContainerEl.hidden = false;
                    } else {
                        detailReviewDateContainerEl.hidden = true;
                    }
                }

                if (editButton) {
                    let editHref = `review-form.html?listId=${listIdFromURL}&editId=${reviewId}`;
                    if (fromGroupedParam && fromPlaceIdParam) {
                        editHref += `&fromGrouped=true&fromPlaceId=${fromPlaceIdParam}&fromItem=${encodeURIComponent(fromItemParam || '')}`;
                    }
                    editButton.href = editHref;
                }

                const authorLinkHref = reviewDataGlobal.userId ? `profile.html?viewUserId=${reviewDataGlobal.userId}` : '';
                if (reviewAuthorNameEl) {
                    reviewAuthorNameEl.textContent = authorNameRaw;
                    if (authorLinkHref) {
                        reviewAuthorNameEl.href = authorLinkHref;
                    } else {
                        reviewAuthorNameEl.removeAttribute('href');
                    }
                }
                if (reviewAuthorLinkEl) {
                    reviewAuthorLinkEl.textContent = authorNameRaw;
                    if (authorLinkHref) {
                        reviewAuthorLinkEl.href = authorLinkHref;
                    } else {
                        reviewAuthorLinkEl.removeAttribute('href');
                    }
                }
                if (reviewAuthorBioEl) {
                    reviewAuthorBioEl.textContent = 'Miembro de la comunidad Listopic';
                }
                renderAuthorAvatar(reviewDataGlobal.authorPhotoUrl || reviewDataGlobal.userPhotoUrl || '', authorNameRaw);

                refreshCriteriaVisuals();

                groupLinkUrl = buildGroupLinkUrl(reviewDataGlobal.placeId || fromPlaceIdParam || null, reviewDataGlobal.itemName || fromItemParam || '');
                applyGroupLink();

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

                if (detailListNameEl) {
                    if (listDataGlobal.name) {
                        detailListNameEl.innerHTML = `Estás viendo en Listopic: <a href="list-view.html?listId=${listIdFromURL}">${uiUtils.escapeHtml(listDataGlobal.name)}</a>`;
                    } else {
                        detailListNameEl.textContent = 'Estás viendo en Listopic: Lista desconocida';
                    }
                }
                if (detailListLinkEl) {
                    if (listDataGlobal.name) {
                        detailListLinkEl.href = `list-view.html?listId=${listIdFromURL}`;
                        detailListLinkEl.textContent = listDataGlobal.name;
                    } else {
                        detailListLinkEl.removeAttribute('href');
                        detailListLinkEl.textContent = 'Lista no disponible';
                    }
                }
                if (uiUtils.updatePageHeaderInfo) {
                    const currentCategory = listDataGlobal?.categoryId || undefined;
                    uiUtils.updatePageHeaderInfo(currentCategory, listDataGlobal?.name);
                }

                if (reviewAuthorBioEl && listDataGlobal?.name) {
                    reviewAuthorBioEl.textContent = `Reseña de la lista “${uiUtils.escapeHtml(listDataGlobal.name)}”`;
                }

                refreshCriteriaVisuals();

                // 3. Obtener datos del autor de la reseña
                if (reviewDataGlobal.userId && reviewAuthorNameEl) {
                    return db.collection('users').doc(reviewDataGlobal.userId).get(); // Esto devuelve una promesa
                } else {
                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.textContent = 'Autor no especificado';
                        reviewAuthorNameEl.removeAttribute('href');
                    }
                    if (reviewAuthorLinkEl) {
                        reviewAuthorLinkEl.textContent = 'Autor no especificado';
                        reviewAuthorLinkEl.removeAttribute('href');
                    }
                    return Promise.resolve(null); // Devolver promesa resuelta para el siguiente .then()
                }
            })
            .then(userDocOrNull => { // userDocOrNull es el resultado de la promesa del autor
                if (userDocOrNull && userDocOrNull.exists) {
                    const userData = userDocOrNull.data();
                    const authorRaw = userData.displayName || userData.username || authorNameRaw || 'Usuario Anónimo';
                    updateShareData({ authorName: authorRaw });

                    const authorHref = reviewDataGlobal.userId ? `profile.html?viewUserId=${reviewDataGlobal.userId}` : '';
                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.textContent = authorRaw;
                        if (authorHref) {
                            reviewAuthorNameEl.href = authorHref;
                        }
                    }
                    if (reviewAuthorLinkEl) {
                        reviewAuthorLinkEl.textContent = authorRaw;
                        if (authorHref) {
                            reviewAuthorLinkEl.href = authorHref;
                        }
                    }
                    if (reviewAuthorBioEl) {
                        reviewAuthorBioEl.textContent = userData.bio || userData.location || reviewAuthorBioEl.textContent || '';
                    }
                    renderAuthorAvatar(userData.photoUrl || reviewDataGlobal.authorPhotoUrl || '', authorRaw);
                } else if (reviewDataGlobal.userId) {
                    if (reviewAuthorNameEl) {
                        reviewAuthorNameEl.textContent = 'Usuario desconocido';
                        reviewAuthorNameEl.removeAttribute('href');
                    }
                    if (reviewAuthorLinkEl) {
                        reviewAuthorLinkEl.textContent = 'Usuario desconocido';
                        reviewAuthorLinkEl.removeAttribute('href');
                    }
                    console.warn(`Autor de reseña con ID ${reviewDataGlobal.userId} no encontrado.`);
                }
                
                // 4. Si la reseña tiene placeId, obtener datos del lugar
                if (reviewDataGlobal && reviewDataGlobal.placeId) {
                    return db.collection('places').doc(reviewDataGlobal.placeId).get(); // Esto devuelve una promesa
                }

                // No hay placeId, mostrar N/A y resolver para finalizar cadena si es necesario
                if (detailEstablishmentNameEl) {
                    detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || "Establecimiento no especificado";
                }
                if (detailLocationContainerEl) detailLocationContainerEl.hidden = true;
                if (detailNoLocationEl) detailNoLocationEl.hidden = false;
                updateShareData({ placeId: '', placeName: reviewDataGlobal.establishmentName || '' });
                return Promise.resolve(null); // Devolver promesa resuelta
            })
            .then(placeDocOrNull => { // placeDocOrNull es el resultado de la promesa del lugar
                let placeData = null;
                if (placeDocOrNull && placeDocOrNull.exists) {
                    placeData = { id: placeDocOrNull.id, ...placeDocOrNull.data() };
                    placeDataGlobal = placeData;
                    if (detailEstablishmentNameEl) {
                        detailEstablishmentNameEl.textContent = placeData.name || 'Nombre de lugar desconocido';
                    }
                    if (detailImageEl && detailImageEl.alt === `Foto de reseña`) {
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || placeData.name)}`;
                    }

                    let mapsUrl = '#';
                    if (placeData.googleMapsUrl) mapsUrl = placeData.googleMapsUrl;
                    else if (placeData.googlePlaceId) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.googlePlaceId}`;
                    else if (placeData.location?.latitude && placeData.location?.longitude) mapsUrl = `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeData.location.latitude},${placeData.location.longitude}`;

                    if (detailLocationContainerEl && detailLocationTextEl && detailLocationLinkEl) {
                        if (mapsUrl !== '#') {
                            detailLocationLinkEl.href = mapsUrl;
                            detailLocationLinkEl.style.pointerEvents = 'auto';
                            detailLocationLinkEl.target = '_blank';
                        } else {
                            detailLocationLinkEl.removeAttribute('href');
                            detailLocationLinkEl.style.pointerEvents = 'none';
                            detailLocationLinkEl.removeAttribute('target');
                        }
                        detailLocationTextEl.textContent = placeData.address || placeData.name;
                        detailLocationContainerEl.hidden = false;
                        if (detailNoLocationEl) detailNoLocationEl.hidden = true;
                    } else if (detailLocationContainerEl) {
                        detailLocationContainerEl.hidden = true;
                        if (detailNoLocationEl) detailNoLocationEl.hidden = false;
                    }

                    if (detailPlaceLinkEl) {
                        detailPlaceLinkEl.textContent = placeData.name || 'Lugar sin nombre';
                        if (mapsUrl !== '#') {
                            detailPlaceLinkEl.href = mapsUrl;
                            detailPlaceLinkEl.target = '_blank';
                        } else {
                            detailPlaceLinkEl.removeAttribute('href');
                            detailPlaceLinkEl.removeAttribute('target');
                        }
                    }
                    if (detailPlaceLinkWrapperEl) {
                        detailPlaceLinkWrapperEl.hidden = false;
                    }
                } else {
                    placeDataGlobal = null;
                    if (reviewDataGlobal && reviewDataGlobal.placeId) {
                        console.warn(`Lugar con ID ${reviewDataGlobal.placeId} no encontrado para la reseña ${reviewId}`);
                    }
                    if (detailEstablishmentNameEl) {
                        detailEstablishmentNameEl.textContent = reviewDataGlobal.establishmentName || 'Establecimiento no especificado';
                    }
                    if (detailLocationContainerEl) detailLocationContainerEl.hidden = true;
                    if (detailNoLocationEl) detailNoLocationEl.hidden = false;
                    if (detailPlaceLinkEl) {
                        detailPlaceLinkEl.textContent = reviewDataGlobal.establishmentName || 'Ubicación no disponible';
                        detailPlaceLinkEl.removeAttribute('href');
                        detailPlaceLinkEl.removeAttribute('target');
                    }
                    if (detailPlaceLinkWrapperEl) {
                        detailPlaceLinkWrapperEl.hidden = false;
                    }
                }
                const placeIdForShare = placeData?.id || reviewDataGlobal?.placeId || fromPlaceIdParam || '';
                const placeNameForShare = placeData?.name || reviewDataGlobal.establishmentName || '';
                updateShareData({
                    placeId: placeIdForShare,
                    placeName: placeNameForShare
                });
                groupLinkUrl = buildGroupLinkUrl(placeIdForShare || null, reviewDataGlobal?.itemName || fromItemParam || '');
                applyGroupLink();
                // Si placeDocOrNull es null, ya se manejo el caso sin placeId antes
            })
            .catch(error => {
                console.error("Error fetching details for detail view:", error);
                if (detailEstablishmentNameEl) detailEstablishmentNameEl.textContent = "Error al cargar datos";
                if (ListopicApp.services && ListopicApp.services.showNotification) {
                     ListopicApp.services.showNotification(error.message || "Error al cargar los detalles.", "error");
                }
                setShareButtonsEnabled(false);
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
