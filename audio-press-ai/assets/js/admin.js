jQuery(document).ready(function($) {
    var container = $('#audio-press-ai-container');
    var generateBtn = $('#audio-press-ai-generate');
    var regenerateBtn = $('#audio-press-ai-regenerate');
    var deleteBtn = $('#audio-press-ai-delete');
    var statusDiv = $('#audio-press-ai-status');
    var statusText = $('#audio-press-ai-status-text');
    var postId = container.data('post-id') || $('#post_ID').val() || '';
    var selectedLanguage = null; // Store selected language
    var currentAudioElement = null; // Store current audio element reference
    
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
    
    // Detect language and show selector
    function detectLanguageAndShowSelector(callback) {
        if (!postId) {
            if (callback) callback();
            return;
        }
        
        statusDiv.show();
        statusText.text('Detecting language...');
        
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: {
                action: 'audio_press_ai_detect_language',
                post_id: postId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                statusDiv.hide();
                
                if (response.success && response.data) {
                    var detectedLang = response.data.detected;
                    var languages = response.data.available || [];
                    var detectedLangName = response.data.languageName || detectedLang;
                    
                    // Show language selector UI
                    var html = '<div id="audio-press-ai-language-selector" style="margin-bottom: 10px; padding: 10px; background: #f0f0f1; border-radius: 4px;">';
                    html += '<label style="display: block; margin-bottom: 5px; font-weight: 600;">';
                    html += 'Detected Language: <span style="color: #2271b1;">' + detectedLangName + '</span>';
                    html += '</label>';
                    html += '<select id="audio-press-ai-language-select" style="width: 100%; margin-bottom: 5px;">';
                    
                    // Add options
                    languages.forEach(function(lang) {
                        html += '<option value="' + lang.code + '"' + (lang.isDetected ? ' selected' : '') + '>';
                        html += lang.name + (lang.isDetected ? ' (Detected)' : '');
                        html += '</option>';
                    });
                    
                    html += '</select>';
                    html += '<small style="color: #50575e; display: block;">Change language if detection is incorrect</small>';
                    html += '<div style="margin-top: 8px;">';
                    html += '<button type="button" class="button button-primary" id="audio-press-ai-generate-with-lang" style="width: 100%;">Generate Audio</button>';
                    html += '</div>';
                    html += '</div>';
                    
                    // Replace generate button with language selector
                    if (generateBtn.length) {
                        generateBtn.hide().after(html);
                    } else {
                        container.prepend(html);
                    }
                    
                    // Set selected language to detected language
                    selectedLanguage = detectedLang;
                    
                    // Bind event to language selector
                    $('#audio-press-ai-language-select').on('change', function() {
                        selectedLanguage = $(this).val();
                    });
                    
                    // Bind event to generate button
                    $('#audio-press-ai-generate-with-lang').on('click', function() {
                        selectedLanguage = $('#audio-press-ai-language-select').val();
                        generateAudio();
                    });
                    
                    if (callback) callback();
                } else {
                    // If detection fails, just proceed with generation
                    if (callback) callback();
                }
            },
            error: function() {
                statusDiv.hide();
                // If detection fails, just proceed with generation
                if (callback) callback();
            }
        });
    }
    
    // Generate audio
    function generateAudio() {
        if (!postId) {
            alert('Post ID not found. Please save the post first.');
            return;
        }
        
        // Disable buttons
        generateBtn.prop('disabled', true);
        regenerateBtn.prop('disabled', true);
        $('#audio-press-ai-generate-with-lang').prop('disabled', true);
        
        // Show status
        statusDiv.show();
        statusText.text(audioPressAI.generating);
        
        // Prepare data
        var ajaxData = {
            action: 'audio_press_ai_generate',
            post_id: postId,
            nonce: audioPressAI.nonce
        };
        
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
                    // Replace container content with custom player
                    var html = '<div id="audio-press-ai-player-wrapper">';
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
                        selectedLanguage = null; // Reset for regeneration
                        detectLanguageAndShowSelector(function() {
                            generateAudio();
                        });
                    });
                    $('#audio-press-ai-delete').on('click', deleteAudio);
                    
                    // Show success message with usage info
                    var message = response.data.message;
                    if (response.data.usage) {
                        message += ' | Characters: ' + response.data.usage.used + '/' + response.data.usage.limit;
                    }
                    if (response.data.generate_count) {
                        message += ' | Generated: ' + response.data.generate_count + ' times this month';
                    }
                    statusText.text(message);
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 7000);
                } else {
                    statusText.text(response.data.message || 'Error generating audio');
                    generateBtn.prop('disabled', false);
                    regenerateBtn.prop('disabled', false);
                    $('#audio-press-ai-generate-with-lang').prop('disabled', false);
                    
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 5000);
                }
            },
            error: function() {
                statusText.text('Network error. Please try again.');
                generateBtn.prop('disabled', false);
                regenerateBtn.prop('disabled', false);
                $('#audio-press-ai-generate-with-lang').prop('disabled', false);
                
                setTimeout(function() {
                    statusDiv.hide();
                }, 5000);
            }
        });
    }
    
    // Delete audio
    function deleteAudio() {
        if (!confirm('Are you sure you want to delete the audio for this post?')) {
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
                post_id: postId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Replace container content with generate button
                    container.html(
                        '<button type="button" class="button button-primary button-large" id="audio-press-ai-generate" style="width: 100%;">' +
                        'Generate Audio Version (AI)' +
                        '</button>'
                    );
                    
                    // Reset language selection
                    selectedLanguage = null;
                    
                    // Re-bind event
                    $('#audio-press-ai-generate').on('click', function() {
                        detectLanguageAndShowSelector(function() {
                            // After detection, the generate button is replaced with language selector
                        });
                    });
                    
                    statusText.text(response.data.message);
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 2000);
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
            selectedLanguage = null; // Reset for regeneration
            detectLanguageAndShowSelector(function() {
                generateAudio();
            });
        });
    }
    if (deleteBtn.length) {
        deleteBtn.on('click', deleteAudio);
    }
});