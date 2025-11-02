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
                    container.html(
                        '<div id="audio-press-ai-player-wrapper">' +
                        '<audio controls style="width: 100%; margin-bottom: 10px;">' +
                        '<source src="' + response.data.audio_url + '" type="audio/mpeg">' +
                        'Your browser does not support the audio element.' +
                        '</audio>' +
                        '<div style="display: flex; gap: 5px;">' +
                        '<button type="button" class="button button-secondary" id="audio-press-ai-regenerate">Regenerate Audio</button>' +
                        '<button type="button" class="button button-link-delete" id="audio-press-ai-delete">Delete Audio</button>' +
                        '</div>' +
                        '</div>'
                    );
                    
                    // Re-bind events
                    $('#audio-press-ai-regenerate').on('click', generateAudio);
                    $('#audio-press-ai-delete').on('click', deleteAudio);
                    
                    // Show success message
                    statusText.text(response.data.message);
                    setTimeout(function() {
                        statusDiv.hide();
                    }, 3000);
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
    generateBtn.on('click', generateAudio);
    regenerateBtn.on('click', generateAudio);
    deleteBtn.on('click', deleteAudio);
});

