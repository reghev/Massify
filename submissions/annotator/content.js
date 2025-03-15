chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "addAnnotation") {
        addAnnotation(request.selectedText);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    restoreAnnotations();
});

restoreAnnotations();

function restoreAnnotations() {
    chrome.storage.local.get(['annotations'], function(result) {
        const annotations = result.annotations || {};
        const pageAnnotations = annotations[window.location.href] || [];
        
        if (pageAnnotations.length === 0) {
            return;
        }
        
        addHighlightStyles();
        
        pageAnnotations.forEach(function(annotation) {
            try {
                const textFound = findAndHighlightTextWithContext(annotation);
                
                if (!textFound) {
                    console.error('Failed to restore annotation:', annotation.text);
                }
            } catch (err) {
                console.error('Error restoring annotation:', err);
            }
        });
    });
}

function findAndHighlightTextWithContext(annotation) {
    const contextBefore = annotation.contextBefore || '';
    const contextAfter = annotation.contextAfter || '';
    const annotationText = annotation.text;

    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
    );

    let node;
    let found = false;
    let nodesChecked = 0;
    let potentialMatches = 0;

    while ((node = walker.nextNode()) && !found) {
        nodesChecked++;
        if (isInScriptOrStyle(node)) continue;

        const nodeText = node.textContent;
        const index = nodeText.indexOf(annotationText);

        if (index !== -1) {
            potentialMatches++;
            
            try {
                const beforeIndex = Math.max(0, index - contextBefore.length);
                const actualContextBefore = nodeText.substring(beforeIndex, index);
                
                const afterIndex = index + annotationText.length;
                const actualContextAfter = nodeText.substring(afterIndex, Math.min(nodeText.length, afterIndex + contextAfter.length));
                
                const normalizedContextBefore = contextBefore.replace(/\s+/g, ' ');
                const normalizedActualBefore = actualContextBefore.replace(/\s+/g, ' ');
                const normalizedContextAfter = contextAfter.replace(/\s+/g, ' ');
                const normalizedActualAfter = actualContextAfter.replace(/\s+/g, ' ');
                
                const beforeSimilarity = normalizedContextBefore.length > 0 ? 
                    normalizedActualBefore.includes(normalizedContextBefore) || 
                    normalizedContextBefore.includes(normalizedActualBefore) : true;
                    
                const afterSimilarity = normalizedContextAfter.length > 0 ? 
                    normalizedActualAfter.includes(normalizedContextAfter) || 
                    normalizedContextAfter.includes(normalizedActualAfter) : true;

                if (beforeSimilarity && afterSimilarity) {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + annotationText.length);

                    const span = document.createElement('span');
                    span.dataset.annotationId = annotation.id;
                    span.classList.add(annotation.color || '__annotator-highlight-yellow');

                    span.addEventListener('click', function() {
                        openPopover(annotation.text, span);
                    });

                    const contents = range.extractContents();
                    span.appendChild(contents);
                    range.insertNode(span);

                    found = true;
                } else {
                    console.warn('Context mismatch, continuing search...');
                }
            } catch (e) {
                console.error('Error highlighting text:', e);
            }
        }
    }

    console.log(`Search completed: checked ${nodesChecked} nodes, found ${potentialMatches} potential matches, final result: ${found ? 'annotation located' : 'annotation not found'}`);
    
    if (!found) {
        console.error('Failed to restore annotation with exact context match');
    }

    return found;
}

function isInScriptOrStyle(node) {
    let parent = node.parentNode;
    while (parent) {
        if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || 
            parent.tagName === 'NOSCRIPT' || parent.tagName === 'TEMPLATE') {
            return true;
        }
        parent = parent.parentNode;
    }
    return false;
}

function addHighlightStyles() {
    if (document.getElementById('__annotator-highlight-styles')) return;
    
    const style = document.createElement('style');
    style.id = '__annotator-highlight-styles';
    style.innerHTML = `
        .__annotator-highlight-red {
            background-color: rgb(255, 80, 80) !important;
            cursor: pointer;
        }

        .__annotator-highlight-yellow {
            background-color: rgb(255, 255, 80) !important;
            cursor: pointer;
        }

        .__annotator-highlight-green {
            background-color: rgb(80, 255, 80) !important;
            cursor: pointer;
        }

        .__annotator-highlight-blue {
            background-color: rgb(128, 128, 255) !important;
            cursor: pointer;
        }

        .__annotator-highlight-purple {
            background-color: rgb(200, 100, 255) !important;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

function createFingerprint(text, context) {
    const fingerprint = {
        text: text,
        contextBefore: context.before || '',
        contextAfter: context.after || ''
    };
    return fingerprint;
}

function addAnnotation(selectedText) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    
    const contextRange = range.cloneRange();
    let contextBefore = '';
    let contextAfter = '';
    
    try {
        contextRange.setStart(range.startContainer, Math.max(0, range.startOffset - 50));
        contextRange.setEnd(range.startContainer, range.startOffset);
        contextBefore = contextRange.toString();
    } catch(e) {
        console.warn('Could not get context before', e);
    }
    
    try {
        contextRange.setStart(range.endContainer, range.endOffset);
        contextRange.setEnd(range.endContainer, Math.min(range.endOffset + 50, range.endContainer.length));
        contextAfter = contextRange.toString();
    } catch(e) {
        console.warn('Could not get context after', e);
    }
    
    const span = document.createElement("span");
    const extractedContent = range.extractContents();
    span.appendChild(extractedContent);
    range.insertNode(span);

    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    span.dataset.annotationId = uuid;

    span.classList.add('__annotator-highlight-yellow');
    
    const annotation = {
        id: span.dataset.annotationId,
        text: selectedText,
        note: selectedText,
        color: '__annotator-highlight-yellow',
        timestamp: Date.now(),
        lastEdited: Date.now(),
        url: window.location.href,
        pageTitle: document.title,
        contextBefore: contextBefore,
        contextAfter: contextAfter
    };
    
    chrome.storage.local.get(['annotations'], function(result) {
        const annotations = result.annotations || {};
        
        if (!annotations[window.location.href]) {
            annotations[window.location.href] = [];
        }
        
        annotations[window.location.href].push(annotation);
        
        chrome.storage.local.set({ annotations: annotations }, function() {
            console.log('Annotation saved:', annotation);
        });
    });

    addHighlightStyles();
    
    span.addEventListener('click', function() {
        openPopover(selectedText, span);
    });
}

function openPopover(selectedText, span) {

    if(document.getElementById('__annotator-popover')) {
        if(window.__annotatorEditing) return;
        document.getElementById('__annotator-popover').remove();
    }
       
    const popover = document.createElement("div");
    popover.id = '__annotator-popover';
    popover.style.position = 'absolute';
    popover.style.zIndex = '1000';
    popover.style.width = '400px';
    popover.style.height = '200px';
    popover.style.display = 'block';

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    let top = rect.top + window.scrollY;
    let left = rect.right + window.scrollX;

    popover.style.visibility = 'hidden';
    document.body.appendChild(popover);
    const popoverRect = popover.getBoundingClientRect();

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const offset = 10;

    if (spaceBelow >= popoverRect.height + offset) {
        // Show below
        top = rect.bottom + window.scrollY + offset;
    } else if (spaceAbove >= popoverRect.height + offset) {
        // Show above
        top = rect.top + window.scrollY - popoverRect.height - offset;
    }

    if (left + popoverRect.width > viewportWidth + window.scrollX) {
        left = rect.left + window.scrollX - popoverRect.width;
    }

    if (left < window.scrollX) {
        left = window.scrollX;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = 'visible';

    let arrowClass = '';

    if (spaceBelow >= popoverRect.height + offset) {
        arrowClass = '__annotator-arrow-top';
        top = rect.bottom + window.scrollY + offset;
    } else if (spaceAbove >= popoverRect.height + offset) {
        arrowClass = '__annotator-arrow-bottom';
        top = rect.top + window.scrollY - popoverRect.height - offset;
    }

    if (left + popoverRect.width > viewportWidth + window.scrollX) {
        left = rect.left + window.scrollX - popoverRect.width;
        arrowClass = arrowClass.replace('-top', '-top-right').replace('-bottom', '-bottom-right');
    } else {
        arrowClass = arrowClass.replace('-top', '-top-left').replace('-bottom', '-bottom-left');
    }
    
    let editMode = false;
    window.__annotatorEditing = editMode;

    popover.innerHTML = `
        <div id="__annotator-popover-inside" class="${arrowClass}">
        
            <div id="__annotator-popover-note" contenteditable="false" spellcheck="false">
                ${selectedText.replace(/<[^>]*>/g, '')}
            </div>
            <div id="__annotator-popover-actions">
                <div class="__annotator-popover-readmode-elements">
                    <button id="__annotator-edit-button" class="__annotator-actionbtn" style="padding-left: 8px; padding-right: 8px; padding-top: 8px; padding-bottom: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" height="14"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg>
                    </button>
                    <button id="__annotator-delete-button" class="__annotator-actionbtn" style="padding-left: 8.875px; padding-right: 8.875px; padding-top: 8px; padding-bottom: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" height="14"><path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0L284.2 0c12.1 0 23.2 6.8 28.6 17.7L320 32l96 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 96C14.3 96 0 81.7 0 64S14.3 32 32 32l96 0 7.2-14.3zM32 128l384 0 0 320c0 35.3-28.7 64-64 64L96 512c-35.3 0-64-28.7-64-64l0-320zm96 64c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16zm96 0c-8.8 0-16 7.2-16 16l0 224c0 8.8 7.2 16 16 16s16-7.2 16-16l0-224c0-8.8-7.2-16-16-16z"/></svg>
                    </button>
                </div>
                <div class="__annotator-popover-readmode-elements" style="margin-top: auto; margin-bottom: auto;">
                    <span style="font-size: 12px; color: #666;">Just now</span>
                </div>

                <div class="__annotator-popover-editmode-elements">
                    <button id="__annotator-save-button" class="__annotator-actionbtn" style="padding-left: 8.875px; padding-right: 8.875px; padding-top: 8px; padding-bottom: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" height="14"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>
                    </button>
                    <button id="__annotator-cancel-button" class="__annotator-actionbtn" style="padding-left: 8px; padding-right: 8px; padding-top: 8px; padding-bottom: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" height="14"><path d="M125.7 160l50.3 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L48 224c-17.7 0-32-14.3-32-32L16 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 51.2L97.6 97.6c87.5-87.5 229.3-87.5 316.8 0s87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3s-163.8-62.5-226.3 0L125.7 160z"/></svg>
                    </button>
                </div>
                <div class="__annotator-popover-editmode-elements" id="colorSelectors" style="margin-top: auto; margin-bottom: auto; gap: 12px;">
                    <div id="__annotator-setcolor-red" class="__annotator-color-selector" style="background-color: #f93535;"></div>
                    <div id="__annotator-setcolor-yellow" class="__annotator-color-selector __annotator-color-selected" style="background-color: #eeea00;"></div>
                    <div id="__annotator-setcolor-green" class="__annotator-color-selector" style="background-color: #69ed2b;"></div>
                    <div id="__annotator-setcolor-blue" class="__annotator-color-selector" style="background-color: #5e63f5;"></div>
                    <div id="__annotator-setcolor-purple" class="__annotator-color-selector" style="background-color: #a846f3;"></div>
                </div>

                <div>
                    <!-- LOGO -->
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1516.2 324.79" height="28"><defs><style>.cls-1{fill:#1d1d1b;}.cls-2{fill:#0ca789;}</style></defs><title>Annotator logo</title><g id="Warstwa_2" data-name="Warstwa 2"><g id="Warstwa_1-2" data-name="Warstwa 1"><path class="cls-1" d="M892,246.49a53,53,0,1,1,53-53A53,53,0,0,1,892,246.49Zm0-84.11a31.15,31.15,0,1,0,31.14,31.14A31.18,31.18,0,0,0,892,162.38Z"/><path class="cls-1" d="M1364.35,246.49a53,53,0,1,1,53-53A53,53,0,0,1,1364.35,246.49Zm0-84.11a31.15,31.15,0,1,0,31.15,31.14A31.18,31.18,0,0,0,1364.35,162.38Z"/><path class="cls-1" d="M561.64,117a70.42,70.42,0,0,0-140.83,0h0V246.49h24.63V186.71H537v59.78h24.63V117Zm-116.2,45v-45h0a45.79,45.79,0,1,1,91.58,0h0v45Z"/><path class="cls-1" d="M690,193.52a53,53,0,0,0-105.92,0h21.82a31.14,31.14,0,1,1,62.28,0Z"/><rect class="cls-1" x="668.14" y="193.52" width="21.82" height="52.96"/><rect class="cls-1" x="584.04" y="193.52" width="21.82" height="52.96"/><rect class="cls-1" x="1443.48" y="193.52" width="21.82" height="52.96"/><path class="cls-1" d="M1496.44,140.56a53,53,0,0,0-53,53h21.82a31.18,31.18,0,0,1,31.14-31.14h19.76V140.56Z"/><path class="cls-1" d="M1165.56,193.58v-.06c0-.41,0-.82,0-1.23h0V140.56h-21.82v10.15a53,53,0,1,0,10.91,75,52.92,52.92,0,0,0,42,20.81V224.67A31.18,31.18,0,0,1,1165.56,193.58Zm-53,31.09a31.15,31.15,0,1,1,31.14-31.15A31.18,31.18,0,0,1,1112.6,224.67Z"/><path class="cls-1" d="M1046.55,113.11V91.29H995.66V46.63H973.84V91.29H952v21.82h21.82v80.41a53,53,0,0,0,53,53h19.75V224.67H1026.8a31.18,31.18,0,0,1-31.14-31.14h0V113.11Z"/><path class="cls-1" d="M1270.34,224.67h0a31.18,31.18,0,0,1-31.14-31.15h0V113.11h50.89V91.29H1239.2V46.63h-21.82V91.29h-21.81v21.82h21.81v80.41a53,53,0,0,0,53,53h19.75V224.67Z"/><path class="cls-1" d="M818.28,193.52a53,53,0,0,0-105.93,0h21.83a31.14,31.14,0,1,1,62.28,0Z"/><rect class="cls-1" x="796.46" y="193.52" width="21.82" height="52.96"/><rect class="cls-1" x="712.35" y="193.52" width="21.82" height="52.96"/><rect class="cls-2" x="192.39" y="32.64" width="57.86" height="151.06" transform="translate(76.1 -90.81) rotate(27.83)"/><path class="cls-2" d="M243.59,10.45H291a5.22,5.22,0,0,1,5.22,5.22v16a0,0,0,0,1,0,0H238.37a0,0,0,0,1,0,0v-16A5.22,5.22,0,0,1,243.59,10.45Z" transform="translate(40.75 -122.35) rotate(27.83)"/><path class="cls-2" d="M154.72,172.36l51.17,27-39.37,21.94a5.2,5.2,0,0,1-7.7-4.07Z"/><path class="cls-2" d="M73.39,113.72c.4.92-6,26.23-5.21,30.55S70.81,158,75.62,153,100,146.37,100,146.37s6.93.67,4.91-9.32-5.23-14.87-4.48-17.42a22.17,22.17,0,0,1,2.33-5s2.62-6-4.93-3.66-13.5,3.72-13.5,3.72S73,112.81,73.39,113.72Z"/><path class="cls-2" d="M73.08,160.2a7.9,7.9,0,0,1-2.23-.33c-6-1.79-7.49-9.77-8.37-14.54-.61-3.32.55-9.81,3.59-24.05.59-2.79,1.32-6.21,1.51-7.43a5.86,5.86,0,0,1,1.24-3.79c2.3-3,5.21-2.93,15.24-1.28,2-.51,6.64-1.7,12-3.34,4.84-1.48,8.52-.85,10.92,1.85,2.6,2.93,2.22,6.92,1,9.68l-.19.43-.25.39a17,17,0,0,0-1.45,2.93c.17.73.64,2.1,1,3.24a88.7,88.7,0,0,1,3.37,11.94c1.12,5.5.31,9.82-2.4,12.84a10.65,10.65,0,0,1-7.94,3.44h-.11c-8.92.76-18.53,3-20.29,4.79A9.18,9.18,0,0,1,73.08,160.2Zm.83-16.84c.25,1.31.47,2.36.68,3.2,7.35-4.22,20.42-5.61,24.83-6a9.68,9.68,0,0,0-.25-2.38,77.62,77.62,0,0,0-3-10.47c-1.28-3.71-2.29-6.65-1.38-9.74l0-.1c-5.3,1.51-9,2.4-9.22,2.44l-1.15.28-1.16-.2c-1.61-.27-3.44-.54-5-.76l-.85,4C76.24,129.23,73.8,140.69,73.91,143.36Zm0-.14h0ZM78.7,111.4Z"/><path class="cls-2" d="M219.71,276.43s1.67-23.4,4.94-12.1,39.26-16.08,20.47-4.31c0,0,8.35-5.13,6.58,3.48s-1.22,20.65-1.22,20.65-1.57,13.27-10.36,12.36-12.22,4.93-15.27,2S219.71,276.43,219.71,276.43Z"/><path class="cls-2" d="M226.7,305.12a8.2,8.2,0,0,1-5.9-2.5c-3-2.93-5.32-11.53-6.85-25.56a5.17,5.17,0,0,1,0-1c1.07-15,3.09-20,8.34-20.54,3.41-.36,5.93,1.6,7.49,5.84,2.39-.28,6.68-2.24,10.38-4.27a5.71,5.71,0,0,1,1.9-2c5.59-3.5,8.67-5.43,12.16-2.56a5.84,5.84,0,0,1,2,3.52c1.24,1.77,2,4.49,1.15,8.61-1.6,7.82-1.11,19.1-1.1,19.21a6,6,0,0,1,0,.95c-1.08,9.13-6.75,18.48-16.72,17.46a13.24,13.24,0,0,0-7.09,1.38A14.86,14.86,0,0,1,226.7,305.12Zm-1.16-28.8a112.1,112.1,0,0,0,3,16.43,24.1,24.1,0,0,1,12.22-2c2.18.25,3.62-4.89,4-6.89a118.87,118.87,0,0,1,.55-16.36l-.24.13c-6.8,3.69-12.35,5.48-16.56,5.3a11.86,11.86,0,0,1-2.52-.37C225.76,273.78,225.63,275.06,225.54,276.32Z"/><path class="cls-2" d="M50.88,255.42l-.6,38.82s3.24,1.34,9.35-2.41,8.8-1.63,17.44-3.6,6.23,6.59,5.93-5.32,2.18-27.49,2.18-27.49-6.65-4.45-12.81-.34S50.88,255.42,50.88,255.42Z"/><path class="cls-2" d="M52,300.28a10.14,10.14,0,0,1-3.91-.69,5.79,5.79,0,0,1-3.57-5.44l.6-38.82a5.8,5.8,0,0,1,7.18-5.54h0c6.09,1.48,14.52,2,16.89.46,7.41-4.94,15.59-2.1,19.26.36a5.8,5.8,0,0,1,2.5,5.73c0,.15-2.4,15.19-2.11,26.42a37,37,0,0,0,.41,5.24,5.85,5.85,0,0,1-9.57,5.72,5.65,5.65,0,0,0-1.28.17,50.05,50.05,0,0,1-9,1.17c-3,.16-4.21.23-6.64,1.72C58.14,299.55,54.51,300.28,52,300.28Zm4.61-37.93-.38,24.78.41-.24c4.94-3,8.57-3.23,12.08-3.42a37.73,37.73,0,0,0,7.11-.9c.44-.1.91-.19,1.39-.26a172.67,172.67,0,0,1,1.61-23.14,4.82,4.82,0,0,0-3.2.73C70.54,263.27,62.5,263.1,56.57,262.35Zm-5.69-6.93h0Z"/><path class="cls-2" d="M72.82,159.08a11.49,11.49,0,0,1-2.76-.29l-.18,0a8.79,8.79,0,0,1-5.17-4.55l-.09-.19a20,20,0,0,1-1.36-4.45c-.21-1.36-.5-2.78-.58-3.17a18.12,18.12,0,0,1,.09-7.38c.52-3,1.15-6.25,1.17-6.39.58-3,.82-6.34.83-6.37a40.08,40.08,0,0,1,1-7.06c.51-2.43.77-3.58.77-3.58a21.82,21.82,0,0,1,1.25-3.66l.63-1.49a5.81,5.81,0,0,1,10.89.49,9.5,9.5,0,0,1,5.45-3.88c.61-.18,1.44-.45,1.84-.59a16.62,16.62,0,0,1,4.76-1.14c1.76-.14,3.64-.15,3.72-.15H98.4c1.78,0,3.35.14,3.53.16a7.44,7.44,0,0,1,6.67,4.85,6.06,6.06,0,0,1,.19.7,10,10,0,0,1,0,3.53,11.32,11.32,0,0,1-1.34,3.62,3.24,3.24,0,0,1-.21.35,2,2,0,0,0-.13.25,16.83,16.83,0,0,1-1.08,2.41,4,4,0,0,0,.24.74c0,.12.08.18.12.3.73,1.9,1.43,4.26,1.46,4.36a36.9,36.9,0,0,1,1.11,5.23c.17,1.28.62,3.24.78,3.88a2.68,2.68,0,0,1,.07.27c.56,2.81.72,4.32.73,4.48a13.26,13.26,0,0,1,0,3.49,8.35,8.35,0,0,1-2.5,4.56,9.14,9.14,0,0,1-3.74,2.47l-.46.14a.91.91,0,0,0-.17.09l-.44.24A17.34,17.34,0,0,1,98,152.66a24.87,24.87,0,0,0-3.65.81l-.26.08c-2.27.6-4.85,1.45-4.87,1.46l-7,2.24-.17.05a50.06,50.06,0,0,1-6.86,1.61A17.1,17.1,0,0,1,72.82,159.08Zm30.59-8h0Zm-26.35-29a29.39,29.39,0,0,0-.72,5,72.09,72.09,0,0,1-1,7.74s-.64,3.35-1.15,6.3c0,.08,0,.16-.05.24a8.7,8.7,0,0,0-.18,2.3,1.6,1.6,0,0,1,0,.21c0,.07.37,1.7.64,3.39.83-.18,2.21-.5,4.15-1.06l6.87-2.2s2.79-.93,5.39-1.62a36.06,36.06,0,0,1,5.62-1.23,13.5,13.5,0,0,0,1.41-.25q.36-.21.81-.42c-.09-.54-.22-1.28-.41-2.22-.16-.66-.73-3.06-1-5.07a24.38,24.38,0,0,0-.73-3.44s-.56-1.9-1.1-3.34a14.37,14.37,0,0,1-1.23-5.48,11.37,11.37,0,0,1,.79-4.12h-.08s-1.49,0-2.79.11a5.07,5.07,0,0,0-1.22.28l-.14.06a5.82,5.82,0,0,1-6.79,4.4l-.6-.12a6.7,6.7,0,0,1-5.24-4.64,12.07,12.07,0,0,0-.44,1.24s-.26,1.18-.77,3.59c0,.12,0,.24-.08.36Zm10.3-3.7-.3,0A2.32,2.32,0,0,0,87.36,118.37Z"/><path class="cls-2" d="M111,257.41s-.45,23.41,2.73,33.7,14.61,4.51,14.61,4.51,14.76,4.3,10.51-6.23,3.56-30.48,3.56-30.48-.7-8-19.76-1.5-10.76,0-10.76,0Z"/><path class="cls-2" d="M121.62,303a14.45,14.45,0,0,1-5.7-1.11c-2.6-1.1-6-3.57-7.76-9.1-2.46-8-2.94-22-3-29.93l-.14-.25a6.56,6.56,0,0,1,.33-6.61,5.8,5.8,0,0,1,5.63-4.42h.89a5.84,5.84,0,0,1,4.21,1.8c1.24-.36,2.78-.84,4.69-1.49,10.52-3.57,18-3.77,22.85-.61a9.8,9.8,0,0,1,4.55,7.09,5.85,5.85,0,0,1-.37,2.62c-2.69,6.9-6.05,20.11-3.59,26.2s.72,9.68-1.13,11.72c-3.8,4.2-10.51,3.56-14.31,2.76A21.43,21.43,0,0,1,121.62,303Zm-4.82-37.76c.16,8,.75,18.64,2.45,24.13.31,1,.71,1.63,1.19,1.84,1.25.54,3.88-.13,5.3-.82a5.88,5.88,0,0,1,4.2-.37,19.76,19.76,0,0,0,3.16.58c-3.27-9.54.3-23.17,2.5-29.92-1.77-.11-5.17.18-11.11,2.19C121.66,263.86,119.1,264.7,116.8,265.27Z"/><path class="cls-2" d="M193.05,317.82a10.66,10.66,0,0,0,1.83-6.27c-.32-3.24,5.42-24.87,5.42-24.87s1.8-6.9-7.3-2.34-5-1.25-15.77,4.1-9.44.88-9.27,3.4,5.59,10.1,1.8,20.43S193.05,317.82,193.05,317.82Z"/><path class="cls-2" d="M181.08,324.79c-6.19,0-12.27-1.1-15.36-4.79a9.44,9.44,0,0,1-1.41-9.72c2.12-5.78.36-10.33-.92-13.65a15.94,15.94,0,0,1-1.21-4.24,5.9,5.9,0,0,1,2-5.88,5.84,5.84,0,0,1,5.11-1.13,24.3,24.3,0,0,0,5.4-2.14c6.11-3,9-3.33,12.15-2.85.14,0,.27.05.42.06a12.36,12.36,0,0,0,3.18-1.29c2-1,8.24-4.14,12.86-.39,3.11,2.51,3.37,6.62,2.65,9.37-2.46,9.27-5.13,20.61-5.24,23.05a16.19,16.19,0,0,1-2.89,10,5.76,5.76,0,0,1-3.72,2.36A77,77,0,0,1,181.08,324.79Zm12-7h0Zm0,0h0Zm-17.34-5.07c2.7.56,8.1.48,13.37-.19a1.77,1.77,0,0,0,0-.45c-.24-2.48,1.17-9.7,4.18-21.5a13.73,13.73,0,0,1-8.23,1.25c-.47-.07-1.26-.2-5.24,1.78-1.62.8-3.1,1.45-4.46,2A28.06,28.06,0,0,1,175.71,312.75ZM200.65,311v.07A.17.17,0,0,1,200.65,311Zm-38.37-18.25h0Zm32.41-7.55a.93.93,0,0,0,0,.14l0-.14Z"/><path class="cls-2" d="M273.65,234s-4,20.23-3.21,23-2.79,10,6.13,8.34a82.35,82.35,0,0,1,18.63-1s8.48,4.74,5-4.38c0,0,4.42-15,5.79-14.31s10.06-13.58-2.68-5.94c0,0-12.2,3.64-18.18,1.67S273.65,234,273.65,234Z"/><path class="cls-2" d="M274.23,271.41a9.79,9.79,0,0,1-6.7-2.33c-3.36-3-3-7.38-2.82-9.72,0-.33.06-.8.07-1.07-.38-1.53-.76-5.72,3.18-25.43a5.81,5.81,0,0,1,9.77-3c1.28,1.26,5.42,4.79,9.2,6,2.64.87,9.6-.29,14.05-1.52,2.94-1.73,9.09-4.89,13.15-.43,2.9,3.19,2.29,8.27-1.63,13.59a11.78,11.78,0,0,1-2.89,2.87c-.86,1.94-2.21,5.86-3.34,9.51,1.17,4.23.49,7.47-2,9.66-3.46,3-8.05,1.64-10.55.52a75.36,75.36,0,0,0-16,.94A17.86,17.86,0,0,1,274.23,271.41Zm1.9-15.59a12.18,12.18,0,0,1,.2,3.67,88.27,88.27,0,0,1,18.25-1c0-.06,0-.12,0-.18a120.88,120.88,0,0,1,3.89-11.5c-4.67.89-10.78,1.53-15.2.07a29.26,29.26,0,0,1-5.66-2.62A93,93,0,0,0,276.13,255.82Zm-11.24,2.86h0ZM276.14,256Zm-.14-.65h0Zm27.52-4.4h0ZM273.65,234h0Z"/><path class="cls-2" d="M7.81,174.47c.29.87,0,1.27-.06,3.26-.13,6.05-.53,18.79-1.64,22.58-1.47,5,2.6,8,6.46,4.6s22.32-3.56,22.32-3.56,11.72,5,7.9-3.42.87-11.38.08-18,3.1-3.56-3.8-2.68S27,179.39,22.94,179c-2.71-.25-8.5-2.17-12.08-3.43C9.05,174.94,7.52,173.6,7.81,174.47Z"/><path class="cls-2" d="M9.21,212.15a9,9,0,0,1-4.87-1.42c-3.75-2.41-5.24-7.14-3.8-12C1,197.06,1.67,190.56,2,177.6c0-.94.09-1.63.14-2.11a5.92,5.92,0,0,1,2-5.73c2.08-1.75,4.63-1.82,7.56-.21a10.67,10.67,0,0,0,1.13.56c6.08,2.14,9.56,3,10.69,3.13a42.18,42.18,0,0,0,8.68-.86c1.84-.29,3.93-.62,6.19-.91a9.08,9.08,0,0,0,1.24-.23,5.87,5.87,0,0,1,3-1.25l5.74-.71L49,175a5.92,5.92,0,0,1-.46,3.1,9.25,9.25,0,0,0,.07,1.09,22.39,22.39,0,0,1-.91,8.86c-.71,2.73-1.11,4.23.35,7.45,2.64,5.81.59,9.18-.87,10.67-3.62,3.7-9.52,2.42-13.38,1-7.68.17-15.65,1.17-17.58,2.23A10.91,10.91,0,0,1,9.21,212.15Zm4.21-29.58a159.7,159.7,0,0,1-1.08,16c6.15-2.39,16.26-2.9,22.49-3H35.9a20.79,20.79,0,0,1,.6-10.41c.17-.63.32-1.21.43-1.75l-3,.46c-4.31.68-8,1.27-11.57.95C21.61,184.71,19.5,184.52,13.42,182.57Zm35.16-4.76Zm-35.27-5.17h0Z"/><path class="cls-2" d="M25.1,18.29C24.51,17,22.37,17,25,24.45s2.9,13.28,5.23,14.83,1.42,6,4.71,5.59S43.3,42,43.62,42.46s5.43.73,5.91-3.25,1.33-7.66,2.5-9.11,1.43-10.11.71-12.69S52,11,48.76,9.73,41.35,11,41.4,11.53s-3.36,1.89-3,4.58S26.28,20.92,25.1,18.29Z"/><path class="cls-2" d="M34.47,50.7c-2.79,0-6.09-1.3-7.95-6.59-.06-.14-.12-.33-.18-.49-2.78-2.26-3.7-5.91-4.76-10.08C21,31.4,20.43,29,19.51,26.37c-1-2.85-4-11.51,2.52-14.12a6.41,6.41,0,0,1,6.82,1.45h.06a17.7,17.7,0,0,0,4-.57A11.16,11.16,0,0,1,36.76,8,7.5,7.5,0,0,1,38.4,6.33c2.1-1.57,7.41-4,12.5-2,5.49,2.18,6.56,7.42,7.14,10.24.09.45.18.89.29,1.29.68,2.46,1.39,13.63-1.66,17.72a23.38,23.38,0,0,0-1.38,6.33,9.64,9.64,0,0,1-7.57,8.28,12.19,12.19,0,0,1-4.29.22l-.76.27a34.27,34.27,0,0,1-7.05,2A10.6,10.6,0,0,1,34.47,50.7Zm4.35-5,.1.14ZM34,34.89a9.56,9.56,0,0,1,2.72,3.56c.72-.23,1.44-.49,2-.7A14,14,0,0,1,44,36.64c.81-5.37,2-8,2.93-9.43a30.9,30.9,0,0,0,.18-8.28c-.19-.68-.33-1.37-.46-2-.1-.47-.24-1.16-.39-1.66l-.52.17a9.45,9.45,0,0,1-1.54,1.45l-.11.08c-.25,2.27-1.77,5.61-8.13,7.37a28.92,28.92,0,0,1-4.66.87c.62,2.05,1.1,3.92,1.5,5.51A41.88,41.88,0,0,0,34,34.89Zm22.58-1.23-.06.07ZM47.5,26.47ZM19.81,20.66h0Zm12.78-3.88h0Zm3-5.61a5.6,5.6,0,0,0,0,.91A5.32,5.32,0,0,1,35.61,11.17Z"/></g></g></svg>
                </div>

            </div>

            <style>

                .__annotator-arrow-top-left:before {
                    content: '' !important;
                    position: absolute !important;
                    top: -10px !important;
                    left: 20px !important;
                    border-width: 0 10px 10px 10px !important;
                    border-style: solid !important;
                    border-color: transparent transparent #ccc transparent !important;
                }

                .__annotator-arrow-top-right:before {
                    content: '' !important;
                    position: absolute !important;
                    top: -10px !important;
                    right: 20px !important;
                    border-width: 0 10px 10px 10px !important;
                    border-style: solid !important;
                    border-color: transparent transparent #ccc transparent !important;
                }

                .__annotator-arrow-bottom-left:before {
                    content: '' !important;
                    position: absolute !important;
                    bottom: -10px !important;
                    left: 20px !important;
                    border-width: 10px 10px 0 10px !important;
                    border-style: solid !important;
                    border-color: #ccc transparent transparent transparent !important;
                }

                .__annotator-arrow-bottom-right:before {
                    content: '' !important;
                    position: absolute !important;
                    bottom: -10px !important;
                    right: 20px !important;
                    border-width: 10px 10px 0 10px !important;
                    border-style: solid !important;
                    border-color: #ccc transparent transparent transparent !important;
                }
            
                #__annotator-popover-inside {
                    width: 100% !important;
                    height: 100% !important;
                    background-color: #f4f4f4 !important;
                    border: 1px solid #ccc !important;
                    border-radius: 5px !important;
                    /* padding: 10px; */
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
                    display: flex !important;
                    flex-direction: column !important;
                    font-size: 14px !important;
                    -webkit-box-shadow: 8px 8px 32px -12px rgba(56,56,56,0.6) !important;
                    -moz-box-shadow: 8px 8px 32px -12px rgba(56,56,56,0.6) !important;
                    box-shadow: 8px 8px 32px -12px rgba(56,56,56,0.6) !important;
                }

                #__annotator-popover-note {
                    flex: 1 !important;
                    overflow-y: auto !important;
                    padding: 10px !important;
                    color: #282828 !important;
                }

                #__annotator-popover-note:focus {
                    outline: none;
                }

                #__annotator-popover-actions {
                    border-top: 1px solid #ccc !important;
                    padding: 10px !important;
                    display: flex !important;
                    justify-content: space-between !important;
                }

                .__annotator-actionbtn {
                    background-color: transparent;
                    border: none;
                    transition: background-color 0.1s;
                    border-radius: 5px;
                }

                .__annotator-actionbtn:hover {
                    cursor: pointer;
                    background-color: #d9d9d9;
                }

                .__annotator-actionbtn svg {
                    fill: #282828;
                }

                .__annotator-popover-readmode-elements {
                    display: block;
                }

                .__annotator-popover-editmode-elements {
                    display: none;
                }

                #colorSelectors {
                    display: none;
                }

                .__annotator-color-selector {
                    border-radius: 100% !important;
                    width: 14px !important;
                    height: 14px !important;
                    cursor: pointer !important;
                }

                .__annotator-color-selected {
                    outline-offset: 2px !important;
                    outline: 2px solid #4d4d4d !important;
                }

            </style>


        </div>
    `;

    document.body.appendChild(popover);

    chrome.storage.local.get(['annotations'], function(result) {
        const annotations = result.annotations || {};
        const urlAnnotations = annotations[window.location.href] || [];
        
        const annotationId = span.dataset.annotationId;
        const annotation = urlAnnotations.find(a => a.id === annotationId);
        
        if (annotation) {
            const noteElement = document.getElementById('__annotator-popover-note');
            noteElement.innerText = annotation.note || annotation.text;
            currentValue = noteElement.innerText;
            
            if (annotation.color) {
                span.classList.remove('__annotator-highlight-red', '__annotator-highlight-yellow', 
                    '__annotator-highlight-green', '__annotator-highlight-blue', 
                    '__annotator-highlight-purple');
                
                span.classList.add(annotation.color);
                
                const colorClass = annotation.color.replace('__annotator-highlight-', '');
                const selectedColorId = `__annotator-setcolor-${colorClass}`;
                
                colorSelectors.forEach(selector => {
                    selector.classList.remove('__annotator-color-selected');
                    if (selector.id === selectedColorId) {
                        selector.classList.add('__annotator-color-selected');
                    }
                });
            }
            
            const timeElement = document.querySelector('.__annotator-popover-readmode-elements span');
            if (timeElement && annotation.lastEdited) {
                const now = Date.now();
                const editTime = annotation.lastEdited;
                const diffMs = now - editTime;
                
                if (diffMs < 60000) {
                    timeElement.textContent = 'Just now';
                } else if (diffMs < 3600000) {
                    const minutes = Math.floor(diffMs / 60000);
                    timeElement.textContent = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
                } else if (diffMs < 86400000) {
                    const hours = Math.floor(diffMs / 3600000);
                    timeElement.textContent = `${hours} hour${hours > 1 ? 's' : ''} ago`;
                } else {
                    const date = new Date(editTime);
                    timeElement.textContent = date.toLocaleDateString();
                }
            } else if (timeElement) {
                timeElement.textContent = 'Just now';
            }
        }
    });

    const editButton = document.getElementById('__annotator-edit-button');
    const saveButton = document.getElementById('__annotator-save-button');
    const cancelButton = document.getElementById('__annotator-cancel-button');
    const deleteButton = document.getElementById('__annotator-delete-button');
    const colorSelectors = Array.from(document.getElementsByClassName('__annotator-color-selector'));
    const colorSelectorsDiv = document.getElementById('colorSelectors');
    const readModeElements = Array.from(document.getElementsByClassName('__annotator-popover-readmode-elements'));
    const editModeElements = Array.from(document.getElementsByClassName('__annotator-popover-editmode-elements'));

    let currentValue = document.getElementById('__annotator-popover-note').innerText;

    function toggleEditMode() {
        editMode = !editMode;
        window.__annotatorEditing = editMode;
        document.getElementById('__annotator-popover-note').contentEditable = editMode;

        readModeElements.forEach(element => {
            element.style.display = editMode ? 'none' : 'block';
        });

        editModeElements.forEach(element => {
            element.style.display = editMode ? 'block' : 'none';
        });

        colorSelectorsDiv.style.display = editMode ? 'flex' : 'none'; 
        
    }

    function cancelEditing() {
        document.getElementById('__annotator-popover-note').innerText = currentValue;
        toggleEditMode();
    }

    function saveEditing() {
        const noteElement = document.getElementById('__annotator-popover-note');
        const newNoteText = noteElement.innerText;
        
        let selectedColor = '';
        const selectedColorElement = document.querySelector('.__annotator-color-selected');
        if (selectedColorElement) {
            if (selectedColorElement.id === '__annotator-setcolor-red') {
                selectedColor = '__annotator-highlight-red';
            } else if (selectedColorElement.id === '__annotator-setcolor-yellow') {
                selectedColor = '__annotator-highlight-yellow';
            } else if (selectedColorElement.id === '__annotator-setcolor-green') {
                selectedColor = '__annotator-highlight-green';
            } else if (selectedColorElement.id === '__annotator-setcolor-blue') {
                selectedColor = '__annotator-highlight-blue';
            } else if (selectedColorElement.id === '__annotator-setcolor-purple') {
                selectedColor = '__annotator-highlight-purple';
            }
        }
        
        const annotationId = span.dataset.annotationId;
        
        chrome.storage.local.get(['annotations'], function(result) {
            const annotations = result.annotations || {};
            const urlAnnotations = annotations[window.location.href] || [];
            
            for (let i = 0; i < urlAnnotations.length; i++) {
                if (urlAnnotations[i].id === annotationId) {
                    urlAnnotations[i].note = newNoteText;
                    urlAnnotations[i].color = selectedColor;
                    urlAnnotations[i].lastEdited = Date.now();
                    break;
                }
            }
            
            annotations[window.location.href] = urlAnnotations;
            chrome.storage.local.set({ annotations: annotations }, function() {
                console.log('Annotation updated:', annotationId);
            });
        });
        
        currentValue = newNoteText;
        toggleEditMode();
    }

    deleteButton.addEventListener('click', function() {
        const annotationId = span.dataset.annotationId;
        deleteAnnotation(annotationId);
    });

    editButton.addEventListener('click', toggleEditMode);
    cancelButton.addEventListener('click', function() {
        cancelEditing();
    });
    saveButton.addEventListener('click', saveEditing);

    colorSelectors.forEach(selector => {
        selector.addEventListener('click', function() {
            colorSelectors.forEach(selector => {
                selector.classList.remove('__annotator-color-selected');
            });
            selector.classList.add('__annotator-color-selected');
            
            let targetSpan = span;
            while (targetSpan.children.length > 0 && targetSpan.children[0].tagName === 'SPAN') {
                targetSpan = targetSpan.children[0];
            }
            
            targetSpan.classList.remove('__annotator-highlight-red');
            targetSpan.classList.remove('__annotator-highlight-yellow');
            targetSpan.classList.remove('__annotator-highlight-green');
            targetSpan.classList.remove('__annotator-highlight-blue');
            targetSpan.classList.remove('__annotator-highlight-purple');

            if(selector.id === '__annotator-setcolor-red') {
                targetSpan.classList.add('__annotator-highlight-red');
            } else if(selector.id === '__annotator-setcolor-yellow') {
                targetSpan.classList.add('__annotator-highlight-yellow');
            } else if(selector.id === '__annotator-setcolor-green') {
                targetSpan.classList.add('__annotator-highlight-green');
            } else if(selector.id === '__annotator-setcolor-blue') {
                targetSpan.classList.add('__annotator-highlight-blue');
            } else if(selector.id === '__annotator-setcolor-purple') {
                targetSpan.classList.add('__annotator-highlight-purple');
            }
            
        });
    });

    setTimeout(() => {
        document.addEventListener('click', function closePopover(event) {
            if (!popover.contains(event.target) && !span.contains(event.target)) {
                if (!window.__annotatorEditing) {
                    popover.remove();
                    document.removeEventListener('click', closePopover);
                }
            }
        });
    }, 0);
}

function deleteAnnotation(annotationId) {
    const span = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    
    if (span) {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
        
        const popover = document.getElementById('__annotator-popover');
        if (popover) {
            popover.remove();
        }
    }
    
    chrome.storage.local.get(['annotations'], function(result) {
        const annotations = result.annotations || {};
        const urlAnnotations = annotations[window.location.href] || [];
        
        const updatedAnnotations = urlAnnotations.filter(a => a.id !== annotationId);
        
        annotations[window.location.href] = updatedAnnotations;
        chrome.storage.local.set({ annotations: annotations }, function() {
            console.log('Annotation deleted:', annotationId);
        });
    });
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "removeAnnotation" && request.annotationId) {
        deleteAnnotation(request.annotationId);
    }
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "goToAnnotation" && request.annotationId) {
        scrollToAnnotation(request.annotationId);
    }
});

function scrollToAnnotation(annotationId) {
    const annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    
    if (annotationElement) {        
        const rect = annotationElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        const scrollToY = rect.top + scrollTop - 100; // 100px above the element
        
        window.scrollTo({
            top: scrollToY,
            behavior: 'smooth'
        });
        
        const originalTransition = annotationElement.style.transition;
        annotationElement.style.transition = 'background-color 0.5s, box-shadow 0.5s';
        annotationElement.style.boxShadow = '0 0 0 4px rgba(255, 215, 0, 0.7)';
        
        setTimeout(() => {
            annotationElement.style.boxShadow = '';
            
            setTimeout(() => {
                annotationElement.style.transition = originalTransition;
            }, 500);
        }, 2000);
    } else {
        console.warn('Annotation not found:', annotationId);
    }
}