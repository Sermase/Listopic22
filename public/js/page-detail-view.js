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

        // Elementos del DOM
        const detailEstablishmentNameEl = document.getElementById('detail-restaurant-name');
        const detailItemNameEl = document.getElementById('detail-dish-name');
        const defaultStoryCustomization = ListopicApp.storyShare?.getDefaultCustomization
            ? ListopicApp.storyShare.getDefaultCustomization()
            : { ...STORY_DEFAULT_CUSTOMIZATION };

            colorScheme: (shareColorSchemeSelect && shareColorSchemeSelect.value) || defaultStoryCustomization.colorScheme,
            graphicStyle: (shareGraphicStyleSelect && shareGraphicStyleSelect.value) || defaultStoryCustomization.graphicStyle
        if (shareColorSchemeSelect && !shareColorSchemeSelect.value) {
            shareColorSchemeSelect.value = shareCustomization.colorScheme;
        }
        if (shareGraphicStyleSelect && !shareGraphicStyleSelect.value) {
            shareGraphicStyleSelect.value = shareCustomization.graphicStyle;
        }

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
        const shareCustomizationContainer = document.getElementById('share-instagram-customization');
        const shareColorSchemeSelect = document.getElementById('share-color-scheme');
        const shareGraphicStyleSelect = document.getElementById('share-graphic-style');
        const shareButtonOriginalHTML = shareButton ? shareButton.innerHTML : '';
        const showNotification = ListopicApp.services?.showNotification;

        const shareCustomization = {
            colorScheme: (shareColorSchemeSelect && shareColorSchemeSelect.value) || 'midnight',
            graphicStyle: (shareGraphicStyleSelect && shareGraphicStyleSelect.value) || 'bars'
        };

        if (shareCustomizationContainer) {
            shareCustomizationContainer.hidden = true;
        }
        setCustomizationControlsDisabled(true);

        let shareAssetsReady = false;
        const shareContext = { review: null, list: null, place: null, author: null };

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

        function setCustomizationControlsDisabled(isDisabled) {
            if (shareColorSchemeSelect) {
                shareColorSchemeSelect.disabled = !!isDisabled;
            }
            if (shareGraphicStyleSelect) {
                shareGraphicStyleSelect.disabled = !!isDisabled;
            }
        }

        function announceCustomizationChange() {
            if (!shareStatusEl) {
                return;
            }
            if (!shareAssetsReady) {
                return;
            }
            const currentClass = shareStatusEl.className || '';
            if (shareStatusEl.hidden || (!currentClass.includes('success') && !currentClass.includes('error'))) {
                setShareStatus('Aplicaremos los nuevos ajustes en la proxima tarjeta.', 'info');
            }
        }

        function toggleShareLoading(isLoading) {
            if (!shareButton) return;
            if (isLoading) {
                shareButton.setAttribute('data-loading', 'true');
                shareButton.setAttribute('aria-busy', 'true');
                shareButton.disabled = true;
                shareButton.innerHTML = '<i class="fas fa-spinner"></i> Generando...';
            } else {
                shareButton.removeAttribute('data-loading');
                shareButton.removeAttribute('aria-busy');
                shareButton.disabled = !shareAssetsReady;
                shareButton.innerHTML = shareButtonOriginalHTML;
            }
            setCustomizationControlsDisabled(isLoading || !shareAssetsReady);
        }


        function enableShareFeature() {
            if (!shareButton || shareAssetsReady === true) return;
            shareAssetsReady = true;
            shareButton.disabled = false;
            shareButton.removeAttribute('aria-busy');
            if (shareHelperEl) shareHelperEl.hidden = false;
            if (shareCustomizationContainer) shareCustomizationContainer.hidden = false;
            setCustomizationControlsDisabled(false);
            setShareStatus('Personaliza la tarjeta y compártela en Instagram Stories.', 'info');
        }

        async function handleShareClick() {
            if (!shareButton) return;
            if (!shareAssetsReady) {
                setShareStatus('Estamos preparando los datos de tu reseña…', 'info');
                return;
            }

            toggleShareLoading(true);
                const fileName = `listopic-story-${shareContext.review?.id || 'reseña'}.png`;
                const shareTitle = `Mi reseña en ${shareContext.place?.name || shareContext.review?.establishmentName || 'Listopic'}`;
                    ? `${shareContext.review?.itemName || 'Mi reseña'} - ${ratingLabel} en Listopic`
                    : `${shareContext.review?.itemName || 'Mi reseña'} en Listopic`;
                        setShareStatus('¡Listo! Si Instagram no se abre automáticamente, revisa tu galería para encontrar la tarjeta.', 'success');
                            console.warn('El uso de la API de compartir falló, se ofrecerá descarga manual.', shareError);
                            setShareStatus('No pudimos abrir Instagram automáticamente. Descarga la tarjeta y súbela manualmente.', 'info');
                    setShareStatus('Descargamos la tarjeta. Súbela como historia desde tu galería.', 'info');
                    showNotification('Tarjeta preparada. Completa la publicación en Instagram.', 'success');
                setShareStatus('No pudimos generar la tarjeta. Inténtalo nuevamente.', 'error');
                return `${rating.toFixed(1)} ⭐`;

            setShareStatus('Preparando datos de tu reseña para compartir…', 'info');
            const errorMsg = "Error: Falta ID de reseña o ID de lista en la URL.";
        // 1. Obtener la reseña
                if (!reviewDoc.exists) throw new Error(`Reseña no encontrada.`);
                // Mostrar datos básicos de la reseña
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || 'reseña')}`;
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
                        setShareStatus('Listo! Si Instagram no se abre automaticamente, revisa tu galeria para encontrar la tarjeta.', 'success');
                    } catch (shareError) {
                        if (shareError?.name === 'AbortError') {
                            setShareStatus('Compartir cancelado. Guardamos la tarjeta en tus descargas para que la compartas cuando quieras.', 'info');
                        } else {
                            console.warn('El uso de la API de compartir fallo, se ofrecera descarga manual.', shareError);
                            setShareStatus('No pudimos abrir Instagram automaticamente. Descarga la tarjeta y subela manualmente.', 'info');
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
                    setShareStatus('Descargamos la tarjeta. Subela como historia desde tu galeria.', 'info');
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }

                if (shared && showNotification) {
                    showNotification('Tarjeta preparada. Completa la publicacion en Instagram.', 'success');
                }
            } catch (error) {
                console.error('Error generando la tarjeta de Instagram:', error);
                setShareStatus('No pudimos generar la tarjeta. Intentalo nuevamente.', 'error');
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
                return `${rating.toFixed(1)} â­ï¸`;
            }
            return '';
        }

        if (shareColorSchemeSelect) {
            shareColorSchemeSelect.addEventListener('change', (event) => {
                shareCustomization.colorScheme = event.target.value || 'midnight';
                announceCustomizationChange();
            });
        }
        if (shareGraphicStyleSelect) {
            shareGraphicStyleSelect.addEventListener('change', (event) => {
                shareCustomization.graphicStyle = event.target.value || 'bars';
                announceCustomizationChange();
            });
        }

        if (shareButton) {
            shareButton.disabled = true;
            shareButton.setAttribute('aria-busy', 'true');
            shareButton.addEventListener('click', handleShareClick);
            setShareStatus('Preparando datos de tu resena para compartirâ€¦', 'info');
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

        let reviewDataGlobal;
        let listDataGlobal; // Lo hacemos accesible en un scope mas amplio

        // 1. Obtener la resena
        db.collection('lists').doc(listIdFromURL).collection('reviews').doc(reviewId).get()
            .then(reviewDoc => {
                if (!reviewDoc.exists) throw new Error(`Resena no encontrada.`);
                reviewDataGlobal = { id: reviewDoc.id, ...reviewDoc.data() };
                shareContext.review = reviewDataGlobal;
                shareContext.author = {
                    id: reviewDataGlobal.userId || null,
                    name: reviewDataGlobal.authorName || reviewDataGlobal.userDisplayName || reviewDataGlobal.username || '',
                    photoUrl: reviewDataGlobal.authorPhotoUrl || ''
                };

                // Mostrar datos basicos de la resena
                if (detailItemNameEl) detailItemNameEl.textContent = reviewDataGlobal.itemName || '';
                if (detailScoreValueEl) detailScoreValueEl.textContent = reviewDataGlobal.overallRating !== undefined ? reviewDataGlobal.overallRating.toFixed(1) : 'N/A';
                
                if (detailImageEl && detailImageEl.parentNode) {
                    if (reviewDataGlobal.photoUrl) {
                        detailImageEl.src = reviewDataGlobal.photoUrl;
                        detailImageEl.alt = `Foto de ${uiUtils.escapeHtml(reviewDataGlobal.itemName || 'resena')}`;
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

                // 2. Obtener la definicion de la lista
                return db.collection('lists').doc(listIdFromURL).get();
            })
            .then(listDoc => {
                if (!listDoc.exists) throw new Error("Lista asociada no encontrada.");
                listDataGlobal = listDoc.data(); // Guardar en el scope mas amplio
                shareContext.list = { id: listIdFromURL, ...listDataGlobal };
                state.currentListCriteriaDefinitions = listDataGlobal.criteriaDefinition || {};

                if(detailListNameEl && listDataGlobal.name) {
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
                    const authorName = uiUtils.escapeHtml(userData.username || userData.displayName || 'Usuario Anonimo');
                    
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
                // Si placeDocOrNull es null, ya se manejo el caso sin placeId antes
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
