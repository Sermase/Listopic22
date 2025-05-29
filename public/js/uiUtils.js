window.ListopicApp = window.ListopicApp || {};

ListopicApp.uiUtils = {
    showPreviewGlobal: function(src, previewContainer) {
        if (!previewContainer) {
            console.warn("showPreviewGlobal: previewContainer no encontrado");
            return;
        }
        previewContainer.innerHTML = '';
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = "Previsualización";
            img.onerror = () => {
                previewContainer.innerHTML = '<p style="color: var(--danger-color, #ff8a80);">Error al cargar imagen.</p>';
            };
            previewContainer.appendChild(img);
        }
    },

    clearPreviewGlobal: function(previewContainer, urlInput, fileInput) {
        // Note: This function previously modified global 'selectedFileForUpload' and 'currentSelectedPlaceInfo'.
        // This behavior will need to be handled by the calling context if those globals are refactored.
        if (previewContainer) previewContainer.innerHTML = '';
        // selectedFileForUpload = null; // Example of global state that was here
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = null;
        // currentSelectedPlaceInfo = null; // Example of global state that was here
    },

    renderTagCheckboxes: function(containerElement, availableTags = [], selectedTags = []) {
        if (!containerElement) {
            console.error("Tag container not found for checkboxes.");
            return;
        }
        containerElement.innerHTML = '';
        if (!Array.isArray(availableTags) || availableTags.length === 0) {
            containerElement.innerHTML = '<p>No hay etiquetas definidas para esta lista.</p>';
            return;
        }
        availableTags.forEach(tag => {
            const tagString = String(tag);
            const tagId = `tag-${tagString.toLowerCase().replace(/\s+/g, '-')}`;
            const isChecked = selectedTags.includes(tagString);

            const label = document.createElement('label');
            label.className = 'tag-checkbox';
            if (isChecked) {
                label.classList.add('selected');
            }

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'tags';
            input.value = tagString;
            input.id = tagId;
            input.checked = isChecked;

            input.addEventListener('change', function () {
                if (this.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            });

            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${tagString}`));
            containerElement.appendChild(label);
        });
    },

    // Note: currentListCriteriaDefinitions was a global variable in the original app.js.
    // For this function to work correctly in a modular setup, 
    // 'currentListCriteriaDefinitions' should ideally be passed as a parameter
    // or accessed from a shared state module (e.g., ListopicApp.state.currentListCriteriaDefinitions).
    // For now, it's moved as is, but its usage context will need adjustment.
    renderCriteriaSliders: function(containerElement, existingRatings = {}, currentListCriteriaDefinitions = []) {
        if (!containerElement) {
            console.error("Criteria container not found for sliders in review form.");
            return;
        }
        containerElement.innerHTML = '';

        if (!Array.isArray(currentListCriteriaDefinitions) || currentListCriteriaDefinitions.length === 0) {
            containerElement.innerHTML = '<p>No hay criterios de valoración definidos para esta lista.</p>';
            return;
        }

        currentListCriteriaDefinitions.forEach(criterion => {
            const criterionKey = criterion.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const currentValue = existingRatings[criterionKey] !== undefined ? parseFloat(existingRatings[criterionKey]) : 5;

            const sliderGroup = document.createElement('div');
            sliderGroup.className = 'form-group slider-group';

            const label = document.createElement('label');
            label.htmlFor = `rating-${criterionKey}`;
            const weightedIndicator = criterion.isWeighted === false ? ' <small class="non-weighted-criterion">(No pondera)</small>' : '';
            label.innerHTML = `${criterion.title}${weightedIndicator}`;


            const sliderInput = document.createElement('input');
            sliderInput.type = 'range';
            sliderInput.id = `rating-${criterionKey}`;
            sliderInput.name = `ratings[${criterionKey}]`;
            sliderInput.min = '0';
            sliderInput.max = '10';
            sliderInput.step = '0.5';
            sliderInput.value = currentValue;
            sliderInput.className = 'form-input rating-slider';

            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'slider-value-display';
            valueDisplay.textContent = parseFloat(sliderInput.value).toFixed(1);

            sliderInput.addEventListener('input', () => {
                valueDisplay.textContent = parseFloat(sliderInput.value).toFixed(1);
            });

            label.appendChild(valueDisplay);
            sliderGroup.appendChild(label);
            sliderGroup.appendChild(sliderInput);

            if (criterion.label_left || criterion.label_right) {
                const rangeLabels = document.createElement('div');
                rangeLabels.className = 'slider-range-labels';
                const leftLabelSpan = document.createElement('span');
                leftLabelSpan.textContent = criterion.label_left || '0';
                const rightLabelSpan = document.createElement('span');
                rightLabelSpan.textContent = criterion.label_right || '10';
                rangeLabels.appendChild(leftLabelSpan);
                rangeLabels.appendChild(rightLabelSpan);
                sliderGroup.appendChild(rangeLabels);
            }
            containerElement.appendChild(sliderGroup);
        });
    },

    escapeHtml: function(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
};
