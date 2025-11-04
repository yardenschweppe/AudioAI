jQuery(document).ready(function($) {
    var container = $('#audio-press-ai-container');
    var generateBtn = $('#audio-press-ai-generate');
    var regenerateBtn = $('#audio-press-ai-regenerate');
    var deleteBtn = $('#audio-press-ai-delete');
    var statusDiv = $('#audio-press-ai-status');
    var statusText = $('#audio-press-ai-status-text');
    var selectedLanguage = null; // Store selected language
    var currentAudioElement = null; // Store current audio element reference
    
    // Function to get post ID dynamically
    function getPostId() {
        var id = '';
        
        // Try multiple methods to get post ID
        // Method 1: Re-check container (it might be added dynamically)
        var $container = $('#audio-press-ai-container');
        if ($container.length) {
            id = $container.attr('data-post-id') || $container.data('post-id') || '';
        }
        
		// Method 2: From WordPress post_ID field (most reliable for classic editor)
		if (!id || id === '0') {
			var postIdField = $('#post_ID, #post_id');
			if (postIdField.length) {
				var fieldVal = postIdField.val();
				if (fieldVal && fieldVal !== '0' && fieldVal !== '') {
					id = fieldVal;
				}
			}
		}
        
        // Method 3: Try to get from URL (for edit pages like post.php?post=123&action=edit)
        if (!id || id === '0') {
            var urlMatch = window.location.href.match(/[?&]post=(\d+)/);
            if (urlMatch && urlMatch[1] && urlMatch[1] !== '0') {
                id = urlMatch[1];
            }
        }
        
        // Method 4: Try wp.data if Gutenberg editor is active
        if ((!id || id === '0') && window.wp && window.wp.data && window.wp.data.select) {
            try {
                var editor = window.wp.data.select('core/editor');
                if (editor && editor.getCurrentPostId) {
                    var gutenbergPostId = editor.getCurrentPostId();
                    if (gutenbergPostId && gutenbergPostId !== 0) {
                        id = String(gutenbergPostId);
                    }
                }
            } catch(e) {
                // Gutenberg not available or not loaded yet
            }
        }
        
		// Method 5: Try to get from form input (handles Classic/Gutenberg variations)
		if (!id || id === '0') {
			var formInput = $('input[name="post_ID"], input[name="post_id"], #post_ID, #post_id');
			if (formInput.length) {
				var inputVal = formInput.val();
				if (inputVal && inputVal !== '0' && inputVal !== '') {
					id = inputVal;
				}
			}
		}
        
        // Convert to number and validate
        id = parseInt(id, 10);
        return (id && id > 0 && !isNaN(id)) ? String(id) : '';
    }
    
    var postId = getPostId();
    
    // Listen for WordPress post save to update post ID (for new posts)
    // WordPress fires this event when a new post is saved
    $(document).on('heartbeat-tick', function(event, data) {
        if (data && data.wp_autosave) {
            var newPostId = getPostId();
            if (newPostId && newPostId !== postId) {
                postId = newPostId;
                // Update container's data attribute
                if (container.length) {
                    container.attr('data-post-id', postId);
                }
            }
        }
    });
    
    // Also listen for the post ID field change (for Gutenberg/Classic Editor)
	$('#post_ID, #post_id').on('change', function() {
        var newPostId = getPostId();
        if (newPostId && newPostId !== postId) {
            postId = newPostId;
            // Update container's data attribute
            if (container.length) {
                container.attr('data-post-id', postId);
            }
        }
    });
    
    // Listen for Gutenberg editor post save events (optimized - only check on save)
    if (window.wp && window.wp.data && window.wp.data.subscribe) {
        try {
            var lastCheckedPostId = postId;
            var checkInterval = null;
            
            // Throttle the check to avoid too many updates
            var checkGutenbergPostId = function() {
                var editor = window.wp.data.select('core/editor');
                if (editor && editor.getCurrentPostId) {
                    var gutenbergPostId = editor.getCurrentPostId();
                    if (gutenbergPostId && gutenbergPostId !== 0) {
                        var newPostId = String(gutenbergPostId);
                        if (newPostId !== lastCheckedPostId && newPostId !== '0') {
                            lastCheckedPostId = newPostId;
                            postId = newPostId;
                            // Update container's data attribute
                            if (container.length) {
                                container.attr('data-post-id', postId);
                            }
                        }
                    }
                }
            };
            
            // Check immediately
            checkGutenbergPostId();
            
            // Subscribe to editor changes, but throttle checks
            window.wp.data.subscribe(function() {
                if (!checkInterval) {
                    checkInterval = setTimeout(function() {
                        checkGutenbergPostId();
                        checkInterval = null;
                    }, 1000); // Check every second at most
                }
            });
        } catch(e) {
            // Gutenberg not available or not loaded yet
        }
    }
    
    // Also listen for form submission (for classic editor) to catch when post is saved
    $(document).on('submit', '#post', function() {
        // Small delay to let WordPress update the post ID field
        setTimeout(function() {
            var newPostId = getPostId();
            if (newPostId && newPostId !== postId) {
                postId = newPostId;
                // Update container's data attribute
                if (container.length) {
                    container.attr('data-post-id', postId);
                }
            }
        }, 500);
    });
    
    // Format time helper
    function formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
    
    // Create custom player HTML
    function createCustomPlayer(audioUrl) {
        var html = '<div class="audio-press-ai-custom-player">';
        html += '<div class="player-controls">';
        html += '<button class="play-pause-btn paused" id="audio-press-ai-play-pause" type="button"></button>';
        html += '<div class="player-info">';
        html += '<div class="progress-container">';
        html += '<div class="progress-bar-wrapper" id="audio-press-ai-progress-wrapper">';
        html += '<div class="progress-bar" id="audio-press-ai-progress"></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="time-display">';
        html += '<span class="time-current" id="audio-press-ai-time-current">0:00</span>';
        html += '<span class="time-separator">/</span>';
        html += '<span class="time-total" id="audio-press-ai-time-total">0:00</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<audio id="audio-press-ai-audio-element" preload="metadata">';
        html += '<source src="' + audioUrl + '" type="audio/wav">';
        html += '<source src="' + audioUrl + '" type="audio/mpeg">';
        html += '</audio>';
        html += '</div>';
        return html;
    }
    
    // Initialize custom player
    function initCustomPlayer(audioUrl) {
        var audio = $('#audio-press-ai-audio-element')[0];
        if (!audio) return;
        
        var playPauseBtn = $('#audio-press-ai-play-pause');
        var progressBar = $('#audio-press-ai-progress');
        var progressWrapper = $('#audio-press-ai-progress-wrapper');
        var timeCurrent = $('#audio-press-ai-time-current');
        var timeTotal = $('#audio-press-ai-time-total');
        
        currentAudioElement = audio;
        
        // Update time display
        function updateTime() {
            if (audio.duration) {
                timeTotal.text(formatTime(audio.duration));
            }
            timeCurrent.text(formatTime(audio.currentTime));
            
            if (audio.duration) {
                var percent = (audio.currentTime / audio.duration) * 100;
                progressBar.css('width', percent + '%');
            }
        }
        
        // Set total time when metadata loaded
        audio.addEventListener('loadedmetadata', function() {
            timeTotal.text(formatTime(audio.duration));
        });
        
        // Update progress while playing
        audio.addEventListener('timeupdate', updateTime);
        
        // Update on load
        audio.addEventListener('loadeddata', updateTime);
        
        // Play/Pause toggle
        playPauseBtn.off('click').on('click', function() {
            if (audio.paused) {
                audio.play().catch(function(err) {
                    console.error('Error playing audio:', err);
                });
                playPauseBtn.removeClass('paused').addClass('playing');
            } else {
                audio.pause();
                playPauseBtn.removeClass('playing').addClass('paused');
            }
        });
        
        // Update button state
        audio.addEventListener('play', function() {
            playPauseBtn.removeClass('paused').addClass('playing');
        });
        
        audio.addEventListener('pause', function() {
            playPauseBtn.removeClass('playing').addClass('paused');
        });
        
        // Seek on progress bar click
        progressWrapper.off('click').on('click', function(e) {
            if (!audio.duration) return;
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var percent = Math.max(0, Math.min(1, x / rect.width));
            audio.currentTime = percent * audio.duration;
        });
        
        // Load audio metadata
        audio.load();
    }
    
    // Initialize existing player (for players that exist on page load)
    function initExistingPlayer() {
        var audio = $('#audio-press-ai-audio-element')[0];
        if (!audio) return;
        
        var playPauseBtn = $('#audio-press-ai-play-pause');
        var progressBar = $('#audio-press-ai-progress');
        var progressWrapper = $('#audio-press-ai-progress-wrapper');
        var timeCurrent = $('#audio-press-ai-time-current');
        var timeTotal = $('#audio-press-ai-time-total');
        
        currentAudioElement = audio;
        
        // Update time display
        function updateTime() {
            if (audio.duration) {
                timeTotal.text(formatTime(audio.duration));
            }
            timeCurrent.text(formatTime(audio.currentTime));
            
            if (audio.duration) {
                var percent = (audio.currentTime / audio.duration) * 100;
                progressBar.css('width', percent + '%');
            }
        }
        
        // Set total time when metadata loaded
        audio.addEventListener('loadedmetadata', function() {
            timeTotal.text(formatTime(audio.duration));
        });
        
        // Update progress while playing
        audio.addEventListener('timeupdate', updateTime);
        
        // Update on load
        audio.addEventListener('loadeddata', updateTime);
        
        // Play/Pause toggle
        playPauseBtn.off('click').on('click', function() {
            if (audio.paused) {
                audio.play().catch(function(err) {
                    console.error('Error playing audio:', err);
                });
                playPauseBtn.removeClass('paused').addClass('playing');
            } else {
                audio.pause();
                playPauseBtn.removeClass('playing').addClass('paused');
            }
        });
        
        // Update button state
        audio.addEventListener('play', function() {
            playPauseBtn.removeClass('paused').addClass('playing');
        });
        
        audio.addEventListener('pause', function() {
            playPauseBtn.removeClass('playing').addClass('paused');
        });
        
        // Seek on progress bar click
        progressWrapper.off('click').on('click', function(e) {
            if (!audio.duration) return;
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var percent = Math.max(0, Math.min(1, x / rect.width));
            audio.currentTime = percent * audio.duration;
        });
        
        // Load audio metadata
        audio.load();
    }
    
    // Helper function to create language selector HTML
    function createLanguageSelectorHTML(response) {
        var detectedLang = response.data.detected;
        var languages = response.data.available || [];
        var detectedLangName = response.data.languageName || detectedLang;
        
        var html = '<div id="audio-press-ai-language-selector" style="margin-bottom: 10px; padding: 12px; background: #f0f6fc; border: 1px solid #c3c4c7; border-radius: 4px;">';
        html += '<div style="padding: 8px 10px; background: #fff; border: 1px solid #c3c4c7; border-radius: 4px; margin-bottom: 10px; font-size: 12px;">';
        html += '<span style="color: #50575e; font-weight: 600;">Detected Language:</span>';
        html += '<strong style="color: #2271b1; margin-left: 8px; font-size: 13px;">' + detectedLangName + '</strong>';
        html += '</div>';
        html += '<label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1d2327;">Select Language:</label>';
        html += '<select id="audio-press-ai-language-select" style="width: 100%; margin-bottom: 8px; padding: 6px;">';
        
        // Add options
        languages.forEach(function(lang) {
            html += '<option value="' + lang.code + '"' + (lang.isDetected ? ' selected' : '') + '>';
            html += lang.name + (lang.isDetected ? ' (Detected)' : '');
            html += '</option>';
        });
        
        html += '</select>';
        html += '<small style="color: #50575e; display: block; margin-bottom: 10px; font-style: italic;">Change language if detection is incorrect</small>';
        html += '<div style="margin-top: 8px; display: flex; gap: 5px;">';
        html += '<button type="button" class="button button-primary" id="audio-press-ai-generate-with-lang" style="flex: 1;">Generate Audio</button>';
        html += '<button type="button" class="button button-secondary" id="audio-press-ai-cancel-language" style="flex: 0 0 auto;">Cancel</button>';
        html += '</div>';
        html += '</div>';
        
        return html;
    }
    
    // Detect language and show selector (for initial generation)
    function detectLanguageAndShowSelector(callback) {
        var currentPostId = getPostId();
        if (!currentPostId) {
            // Show error message if post ID is missing
            statusDiv.show();
            statusDiv.css('border-left-color', '#d63638'); // Red for error
            statusText.text('❌ Post ID is required. Please save the post first as a draft or publish it.');
            
            // Restore button if it was disabled
            restoreButton(generateBtn);
            
            setTimeout(function() {
                statusDiv.hide();
                statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
            }, 5000);
            
            if (callback) callback();
            return;
        }
        
        statusDiv.show();
        statusDiv.css('border-left-color', '#2271b1'); // Blue for info
        statusText.text('Detecting language...');
        
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: {
                action: 'audio_press_ai_detect_language',
                post_id: currentPostId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                statusDiv.hide();
                
                if (response.success && response.data) {
                    var html = createLanguageSelectorHTML(response);
                    
                    // Replace generate button with language selector (only hide AFTER successful detection)
                    if (generateBtn.length) {
                        generateBtn.hide().after(html);
                    } else {
                        container.prepend(html);
                    }
                    
                    // Set selected language to detected language
                    selectedLanguage = response.data.detected;
                    
                    // Bind events
                    bindLanguageSelectorEvents();
                    
                    if (callback) callback();
                } else {
                    // If detection fails, show error and restore button
                    statusDiv.show();
                    statusDiv.css('border-left-color', '#d63638'); // Red for error
                    statusText.text('❌ Language detection failed. Proceeding with generation...');
                    restoreButton(generateBtn);
                    
                    setTimeout(function() {
                        statusDiv.hide();
                        statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                    }, 3000);
                    
                    // If detection fails, just proceed with generation
                    if (callback) callback();
                }
            },
            error: function(xhr, status, error) {
                statusDiv.show();
                statusDiv.css('border-left-color', '#d63638'); // Red for error
                
                // Check if error is about missing post ID
                var errorMessage = '❌ Error detecting language. ';
                if (xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message) {
                    if (xhr.responseJSON.data.message.indexOf('Post ID') !== -1 || 
                        xhr.responseJSON.data.message.indexOf('post id') !== -1) {
                        errorMessage = '❌ Post ID is required. Please save the post first as a draft or publish it.';
                    } else {
                        errorMessage += xhr.responseJSON.data.message;
                    }
                } else {
                    errorMessage += 'Please try again.';
                }
                
                statusText.text(errorMessage);
                restoreButton(generateBtn);
                
                setTimeout(function() {
                    statusDiv.hide();
                    statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                }, 5000);
                
                // If detection fails, don't proceed - let user try again
                if (callback) callback();
            }
        });
    }
    
    // Detect language and show selector for regenerate (inserts above player)
    function detectLanguageAndShowSelectorForRegenerate(callback, $insertBefore) {
        var currentPostId = getPostId();
        if (!currentPostId) {
            if (callback) callback();
            return;
        }
        
        statusDiv.show();
        statusDiv.css('border-left-color', '#2271b1'); // Blue for info
        statusText.text('Detecting language...');
        
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: {
                action: 'audio_press_ai_detect_language',
                post_id: currentPostId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                statusDiv.hide();
                
                // Remove any existing language selector
                $('#audio-press-ai-language-selector').remove();
                
                if (response.success && response.data) {
                    var html = createLanguageSelectorHTML(response);
                    
                    // Insert language selector before the player wrapper or at the beginning of container
                    if ($insertBefore && $insertBefore.length) {
                        $insertBefore.before(html);
                    } else if (container.length) {
                        container.prepend(html);
                    }
                    
                    // Set selected language to detected language
                    selectedLanguage = response.data.detected;
                    
                    // Bind events (with regenerate mode)
                    bindLanguageSelectorEvents(true);
                    
                    // Scroll to selector
                    $('html, body').animate({
                        scrollTop: $('#audio-press-ai-language-selector').offset().top - 50
                    }, 300);
                    
                    if (callback) callback();
                } else {
                    // If detection fails, show error
                    statusText.text('❌ Language detection failed. Please try again.');
                    statusDiv.css('border-left-color', '#d63638');
                    setTimeout(function() {
                        statusDiv.hide();
                        statusDiv.css('border-left-color', '#2271b1');
                    }, 3000);
                    if (callback) callback();
                }
            },
            error: function() {
                statusDiv.hide();
                statusText.text('❌ Language detection failed. Please try again.');
                statusDiv.css('border-left-color', '#d63638');
                setTimeout(function() {
                    statusDiv.hide();
                    statusDiv.css('border-left-color', '#2271b1');
                }, 3000);
                if (callback) callback();
            }
        });
    }
    
    // Bind events for language selector
    function bindLanguageSelectorEvents(isRegenerate) {
        // Remove existing handlers to avoid duplicates
        $('#audio-press-ai-language-select').off('change');
        $('#audio-press-ai-generate-with-lang').off('click');
        $('#audio-press-ai-cancel-language').off('click');
        
        // Bind event to language selector
        $('#audio-press-ai-language-select').on('change', function() {
            selectedLanguage = $(this).val();
        });
        
        // Bind event to generate button
        $('#audio-press-ai-generate-with-lang').on('click', function() {
            selectedLanguage = $('#audio-press-ai-language-select').val();
            // Remove language selector before generating
            $('#audio-press-ai-language-selector').remove();
            generateAudio();
        });
        
        // Bind event to cancel button
        $('#audio-press-ai-cancel-language').on('click', function() {
            $('#audio-press-ai-language-selector').remove();
            // Restore buttons if in regenerate mode
            if (isRegenerate) {
                restoreButton($('#audio-press-ai-regenerate'));
                restoreButton(regenerateBtn);
            } else {
                // Restore generate button - make sure it's visible and enabled
                if (generateBtn.length) {
                    generateBtn.show();
                    restoreButton(generateBtn);
                } else {
                    // If button doesn't exist (was removed), recreate it
                    container.prepend(
                        '<button type="button" class="button button-primary button-large" id="audio-press-ai-generate" style="width: 100%;">' +
                        'Generate Audio Version (AI)' +
                        '</button>'
                    );
                    generateBtn = $('#audio-press-ai-generate');
                    generateBtn.on('click', function() {
                        detectLanguageAndShowSelector(function() {
                            // After detection, the generate button is replaced with language selector
                        });
                    });
                }
            }
            // Reset selected language
            selectedLanguage = null;
        });
    }
    
    // Generate audio
    function generateAudio() {
        var currentPostId = getPostId();
        
        if (!currentPostId) {
            // Show error message instead of alert
            statusDiv.show();
            statusDiv.css('border-left-color', '#d63638'); // Red for error
            statusText.text('❌ Post ID is required. Please save the post first as a draft or publish it.');
            
            // Restore all buttons
            restoreButton(generateBtn);
            restoreButton(regenerateBtn);
            restoreButton($('#audio-press-ai-generate-with-lang'));
            
            setTimeout(function() {
                statusDiv.hide();
                statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
            }, 5000);
            return;
        }
        
        // Disable buttons
        generateBtn.prop('disabled', true);
        regenerateBtn.prop('disabled', true);
        $('#audio-press-ai-generate-with-lang').prop('disabled', true);
        
        // Show status
        statusDiv.show();
        statusDiv.css('border-left-color', '#2271b1'); // Blue for info
        statusText.text(audioPressAI.generating);
        
        // Prepare data - ensure post_id is valid before sending
        var ajaxData = {
            action: 'audio_press_ai_generate',
            nonce: audioPressAI.nonce
        };
        
        // Only add post_id if it's valid (not empty, not 0, not '0')
        if (currentPostId && currentPostId !== '0' && currentPostId !== '') {
            ajaxData.post_id = String(currentPostId);
        }
        
        // Add language if selected
        if (selectedLanguage) {
            ajaxData.language = selectedLanguage;
        }
        
        // AJAX request
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: ajaxData,
            success: function(response) {
                if (response.success) {
                    // Language names mapping
                    var languageNames = {
                        'en': 'English',
                        'es': 'Español (Spanish)',
                        'pt_PT': 'Português PT (Portuguese Portugal)',
                        'pt_BR': 'Português BR (Portuguese Brazil)',
                        'de': 'Deutsch (German)',
                        'nl_NL': 'Nederlands NL (Dutch Netherlands)',
                        'nl_BE': 'Nederlands BE (Dutch Belgium)',
                        'da': 'Dansk (Danish)',
                        'sv': 'Svenska (Swedish)',
                        'he': 'עברית (Hebrew)',
                        'ar': 'ערבית (Arabic)',
                        'ru': 'Русский (Russian)',
                        'zh': '中文/日本語/한국어 (CJK)'
                    };
                    
                    // Replace container content with custom player
                    var html = '<div id="audio-press-ai-player-wrapper">';
                    
                    // Show detected language if available
                    if (response.data.language && languageNames[response.data.language]) {
                        html += '<div style="padding: 8px 10px; background: #f0f6fc; border: 1px solid #c3c4c7; border-radius: 4px; margin-bottom: 10px; font-size: 12px;">';
                        html += '<span style="color: #50575e;">Language:</span>';
                        html += '<strong style="color: #2271b1; margin-left: 5px;">' + languageNames[response.data.language] + '</strong>';
                        html += '</div>';
                    }
                    
                    html += createCustomPlayer(response.data.audio_url);
                    html += '<div style="display: flex; gap: 5px; margin-top: 10px;">';
                    html += '<button type="button" class="button button-secondary" id="audio-press-ai-regenerate">Regenerate Audio</button>';
                    html += '<button type="button" class="button button-link-delete" id="audio-press-ai-delete">Delete Audio</button>';
                    html += '</div>';
                    html += '</div>';
                    
                    container.html(html);
                    
                    // Initialize custom player
                    initCustomPlayer(response.data.audio_url);
                    
                    // Re-bind events
                    $('#audio-press-ai-regenerate').on('click', function() {
                        var $btn = $(this);
                        var $playerWrapper = $('#audio-press-ai-player-wrapper');
                        
                        // Show immediate visual feedback
                        setButtonLoading($btn, 'Preparing...');
                        
                        selectedLanguage = null; // Reset for regeneration
                        
                        // Show language selector above the player (for regenerate flow)
                        detectLanguageAndShowSelectorForRegenerate(function() {
                            // This callback is called after language selector is shown
                            // The actual generation happens when user clicks "Generate Audio" in the selector
                            restoreButton($btn); // Re-enable regenerate button in case user cancels
                        }, $playerWrapper);
                    });
                    $('#audio-press-ai-delete').on('click', deleteAudio);
                    
                    // Restore regenerate button state
                    restoreButton($('#audio-press-ai-regenerate'));
                    restoreButton(regenerateBtn);
                    
                    // Show success message with usage info
                    var message = '✅ Audio generated successfully!';
                    if (response.data.usage) {
                        message += ' | Characters: ' + response.data.usage.used + '/' + response.data.usage.limit;
                    }
                    if (response.data.generate_count) {
                        message += ' | Generated: ' + response.data.generate_count + ' times this month';
                    }
                    statusText.text(message);
                    statusDiv.css('border-left-color', '#00a32a'); // Green for success
                    setTimeout(function() {
                        statusDiv.hide();
                        statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                    }, 7000);
                } else {
                    var errorMsg = '❌ ' + (response.data && response.data.message ? response.data.message : 'Error generating audio');
                    statusText.text(errorMsg);
                    statusDiv.css('border-left-color', '#d63638'); // Red for error
                    
                    // If error is about post ID, restore generate button visibility
                    if (errorMsg.indexOf('Post ID') !== -1 || errorMsg.indexOf('post id') !== -1) {
                        // Remove language selector if it exists
                        $('#audio-press-ai-language-selector').remove();
                        // Restore generate button
                        if (generateBtn.length && !generateBtn.is(':visible')) {
                            generateBtn.show();
                        }
                    }
                    
                    restoreButton(generateBtn);
                    restoreButton(regenerateBtn);
                    restoreButton($('#audio-press-ai-generate-with-lang'));
                    $('#audio-press-ai-generate-with-lang').prop('disabled', false);
                    
                    setTimeout(function() {
                        statusDiv.hide();
                        statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                    }, 5000);
                }
            },
            error: function(xhr, status, error) {
                var errorMsg = '❌ Network error. Please try again.';
                
                // Check if error response contains message about post ID
                if (xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message) {
                    errorMsg = '❌ ' + xhr.responseJSON.data.message;
                    
                    // If error is about post ID, restore generate button visibility
                    if (errorMsg.indexOf('Post ID') !== -1 || errorMsg.indexOf('post id') !== -1) {
                        // Remove language selector if it exists
                        $('#audio-press-ai-language-selector').remove();
                        // Restore generate button
                        if (generateBtn.length && !generateBtn.is(':visible')) {
                            generateBtn.show();
                        }
                    }
                }
                
                statusText.text(errorMsg);
                statusDiv.css('border-left-color', '#d63638'); // Red for error
                restoreButton(generateBtn);
                restoreButton(regenerateBtn);
                restoreButton($('#audio-press-ai-generate-with-lang'));
                $('#audio-press-ai-generate-with-lang').prop('disabled', false);
                
                setTimeout(function() {
                    statusDiv.hide();
                    statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                }, 5000);
            }
        });
    }
    
    // Delete audio
    function deleteAudio() {
        if (!confirm('Are you sure you want to delete the audio for this post?')) {
            return;
        }
        
        var currentPostId = getPostId();
        if (!currentPostId) {
            alert('Post ID not found. Please save the post first.');
            return;
        }
        
        deleteBtn.prop('disabled', true);
        statusDiv.show();
        statusText.text('Deleting audio...');
        
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: {
                action: 'audio_press_ai_delete',
                post_id: currentPostId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Replace container content with generate button
                    container.html(
                        '<button type="button" class="button button-primary button-large" id="audio-press-ai-generate" style="width: 100%;">' +
                        'Generate Audio Version (AI)' +
                        '</button>' +
                        '<div id="audio-press-ai-status" style="margin-top: 10px; display: none;">' +
                        '<p><span class="spinner is-active" style="float: none; margin: 0 5px 0 0;"></span>' +
                        '<span id="audio-press-ai-status-text"></span></p>' +
                        '</div>'
                    );
                    
                    // Reset language selection
                    selectedLanguage = null;
                    
                    // Re-bind the generate button click event (only once!)
                    var newGenerateBtn = $('#audio-press-ai-generate');
                    newGenerateBtn.off('click'); // Remove any existing handlers
                    newGenerateBtn.on('click', function() {
                        var $btn = $(this);
                        // Show immediate visual feedback
                        setButtonLoading($btn, 'Preparing...');
                        
                        selectedLanguage = null; // Reset language selection
                        
                        // Show language selector and wait for user to select language & click "Generate Audio"
                        detectLanguageAndShowSelector(function() {
                            // This callback is called after language selector is shown
                            // The actual generation happens when user clicks "Generate Audio" in the selector
                            restoreButton($btn); // Re-enable button in case user cancels
                        });
                    });
                    
                    // Update status references after HTML replacement
                    statusDiv = $('#audio-press-ai-status');
                    statusText = $('#audio-press-ai-status-text');
                    
                    // Show success message
                    statusDiv.show();
                    statusDiv.css('border-left-color', '#00a32a'); // Green for success
                    statusText.text('✅ ' + response.data.message);
                    setTimeout(function() {
                        statusDiv.hide();
                        statusDiv.css('border-left-color', '#2271b1'); // Reset to blue
                    }, 3000);
                } else {
                    statusText.text(response.data.message || 'Error deleting audio');
                    deleteBtn.prop('disabled', false);
                    
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 5000);
                }
            },
            error: function() {
                statusText.text('Network error. Please try again.');
                deleteBtn.prop('disabled', false);
                
                setTimeout(function() {
                    statusDiv.hide();
                }, 5000);
            }
        });
    }
    
    // Helper function to show button loading state
    function setButtonLoading($btn, loadingText) {
        if (!$btn.length) return;
        var originalText = $btn.text();
        $btn.data('original-text', originalText);
        $btn.prop('disabled', true);
        $btn.html('<span class="spinner is-active" style="float: none; margin: 0 5px 0 0;"></span>' + loadingText);
        $btn.addClass('is-loading');
    }
    
    // Helper function to restore button normal state
    function restoreButton($btn) {
        if (!$btn.length) return;
        var originalText = $btn.data('original-text');
        $btn.prop('disabled', false);
        if (originalText) {
            $btn.text(originalText);
        } else {
            // If no original text saved, try to extract text (remove spinner HTML)
            var currentText = $btn.text().replace(/Regenerating\.\.\.|Generating\.\.\./g, '').trim();
            if (currentText) {
                $btn.text(currentText);
            }
        }
        $btn.removeClass('is-loading');
    }
    
    // Bind events
    if (generateBtn.length) {
        generateBtn.on('click', function() {
            detectLanguageAndShowSelector(function() {
                // After detection, the generate button is replaced with language selector
            });
        });
    }
    if (regenerateBtn.length) {
        regenerateBtn.on('click', function() {
            var $btn = $(this);
            var $playerWrapper = $('#audio-press-ai-player-wrapper');
            
            // Show immediate visual feedback
            setButtonLoading($btn, 'Preparing...');
            
            selectedLanguage = null; // Reset for regeneration
            
            // Show language selector above the player (for regenerate flow)
            detectLanguageAndShowSelectorForRegenerate(function() {
                // This callback is called after language selector is shown
                // The actual generation happens when user clicks "Generate Audio" in the selector
                restoreButton($btn); // Re-enable regenerate button in case user cancels
            }, $playerWrapper);
        });
    }
    if (deleteBtn.length) {
        deleteBtn.on('click', deleteAudio);
    }
});