jQuery(document).ready(function($) {
    var container = $('#audio-press-ai-container');
    var generateBtn = $('#audio-press-ai-generate');
    var regenerateBtn = $('#audio-press-ai-regenerate');
    var deleteBtn = $('#audio-press-ai-delete');
    var statusDiv = $('#audio-press-ai-status');
    var statusText = $('#audio-press-ai-status-text');
    var postId = container.data('post-id') || $('#post_ID').val() || '';
    
    // Generate audio
    function generateAudio() {
        if (!postId) {
            alert('Post ID not found. Please save the post first.');
            return;
        }
        
        // Disable buttons
        generateBtn.prop('disabled', true);
        regenerateBtn.prop('disabled', true);
        
        // Show status
        statusDiv.show();
        statusText.text(audioPressAI.generating);
        
        // AJAX request
        $.ajax({
            url: audioPressAI.ajaxUrl,
            type: 'POST',
            data: {
                action: 'audio_press_ai_generate',
                post_id: postId,
                nonce: audioPressAI.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Replace container content with player
                    var html = '<div id="audio-press-ai-player-wrapper">';
                    html += '<audio controls style="width: 100%; margin-bottom: 10px;">';
                    html += '<source src="' + response.data.audio_url + '" type="audio/wav">';
                    html += '<source src="' + response.data.audio_url + '" type="audio/mpeg">';
                    html += 'Your browser does not support the audio element.';
                    html += '</audio>';
                    html += '<div style="display: flex; gap: 5px;">';
                    html += '<button type="button" class="button button-secondary" id="audio-press-ai-regenerate">Regenerate Audio</button>';
                    html += '<button type="button" class="button button-link-delete" id="audio-press-ai-delete">Delete Audio</button>';
                    html += '</div>';
                    html += '</div>';
                    
                    container.html(html);
                    
                    // Re-bind events
                    $('#audio-press-ai-regenerate').on('click', generateAudio);
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
                    
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 5000);
                }
            },
            error: function() {
                statusText.text('Network error. Please try again.');
                generateBtn.prop('disabled', false);
                regenerateBtn.prop('disabled', false);
                
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
                    
                    // Re-bind event
                    $('#audio-press-ai-generate').on('click', generateAudio);
                    
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
        generateBtn.on('click', generateAudio);
    }
    if (regenerateBtn.length) {
        regenerateBtn.on('click', generateAudio);
    }
    if (deleteBtn.length) {
        deleteBtn.on('click', deleteAudio);
    }
});

