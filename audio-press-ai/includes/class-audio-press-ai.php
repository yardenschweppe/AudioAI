<?php
/**
 * Main plugin class
 */

if (!defined('ABSPATH')) {
    exit;
}

class Audio_Press_AI {
    
    public function init() {
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        
        // Post editor hooks
        add_action('add_meta_boxes', array($this, 'add_meta_box'));
        
        // AJAX handlers
        add_action('wp_ajax_audio_press_ai_generate', array($this, 'ajax_generate_audio'));
        add_action('wp_ajax_audio_press_ai_delete', array($this, 'ajax_delete_audio'));
        add_action('wp_ajax_audio_press_ai_detect_language', array($this, 'ajax_detect_language'));
        add_action('wp_ajax_audio_press_ai_test_generate', array($this, 'ajax_test_generate'));
        
        // Frontend hooks
        add_filter('the_content', array($this, 'embed_audio_player'), 10);
        
        // Auto-generate on publish
        add_action('save_post', array($this, 'maybe_auto_generate_audio'), 10, 2);
        
        // Admin scripts and styles
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        
        // Frontend styles
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
    }
    
    /**
     * Check if user has Pro license
     * Always validates with Freemius API to ensure license status is current
     */
    private function is_pro_user() {
        // In dev mode, always return true (allows testing without license)
        if (defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true) {
            return true;
        }
        
        if (!function_exists('apai_fs')) {
            return false;
        }
        
        try {
            $fs = apai_fs();
            
            // Note: The server will always validate with Freemius API on each request
            // This check in WordPress is a first line of defense, but the server is the authority
            // Check if user has active valid license (more reliable than is_paying)
            if (is_callable(array($fs, 'has_active_valid_license'))) {
                return $fs->has_active_valid_license();
            }
            
            // Fallback to is_paying if has_active_valid_license is not available
            if (is_callable(array($fs, 'is_paying'))) {
                return $fs->is_paying();
            } elseif (isset($fs->is_paying)) {
                // Fallback if it's a property
                return (bool) $fs->is_paying;
            }
        } catch (Exception $e) {
            // Log error for debugging
            error_log('Audio-Press AI: Error checking Pro license: ' . $e->getMessage());
            return false;
        }
        
        return false;
    }
    
    /**
     * Get Freemius license key
     */
    private function get_license_key() {
        // In dev mode, return "TEST" license key (works with server TEST_MODE)
        if (defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true) {
            return 'TEST';
        }
        
        if (!function_exists('apai_fs')) {
            return false;
        }
        
        $fs = apai_fs();
        
        // Check if _get_license is a method (callable) or property
        if (is_callable(array($fs, '_get_license'))) {
            $license = $fs->_get_license();
        } elseif (isset($fs->_get_license)) {
            $license = $fs->_get_license;
        } else {
            return false;
        }
        
        if ($license && isset($license->secret_key)) {
            return $license->secret_key;
        }
        
        return false;
    }
    
    /**
     * Add admin menu page
     */
    public function add_admin_menu() {
        // Check if Freemius is available and has created a menu
        $freemius_available = false;
        if (function_exists('apai_fs')) {
            $fs = apai_fs();
            // Check if Freemius object is valid (not dummy object)
            if (is_object($fs) && method_exists($fs, 'has_menu')) {
                try {
                    $freemius_available = $fs->has_menu();
                } catch (Exception $e) {
                    $freemius_available = false;
                }
            }
        }
        
        if ($freemius_available) {
            // Freemius handles the main menu with slug 'audioai', so we add a submenu
            add_submenu_page(
                'audioai',  // Parent menu slug - חייב להתאים ל-slug ב-Freemius
                __('Settings', 'audio-press-ai'),
                __('Settings', 'audio-press-ai'),
                'manage_options',
                'audio-press-ai-settings',
                array($this, 'render_settings_page')
            );
        } else {
            // Freemius not available - create our own menu
            add_menu_page(
                __('Audio-Press AI', 'audio-press-ai'),
                __('Audio-Press AI', 'audio-press-ai'),
                'manage_options',
                'audioai',  // שונה ל-audioai כדי להיות תואם ל-Freemius
                array($this, 'render_settings_page'),
                'dashicons-controls-volumeon',
                30
            );
            add_submenu_page(
                'audioai',  // שונה ל-audioai כדי להיות תואם ל-Freemius
                __('Settings', 'audio-press-ai'),
                __('Settings', 'audio-press-ai'),
                'manage_options',
                'audio-press-ai-settings',
                array($this, 'render_settings_page')
            );
        }
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        // API Server URL is constant - no longer registered as setting
        // Model/Quality is not used by server - removed
        register_setting('audio_press_ai_settings', 'audio_press_ai_voice');
        register_setting('audio_press_ai_settings', 'audio_press_ai_auto_embed');
        register_setting('audio_press_ai_settings', 'audio_press_ai_auto_generate');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        // Check user capabilities
        if (!current_user_can('manage_options')) {
            wp_die(__('You do not have sufficient permissions to access this page.', 'audio-press-ai'));
        }
        
        // Ensure constants are defined
        if (!defined('AUDIO_PRESS_AI_API_URL')) {
            wp_die(__('Plugin error: AUDIO_PRESS_AI_API_URL constant is not defined.', 'audio-press-ai'));
        }
        
        if (isset($_POST['submit'])) {
            check_admin_referer('audio_press_ai_settings');
            
            // API Server URL is constant - no longer editable in UI
            // It's always set to AUDIO_PRESS_AI_API_URL constant
            
            // Validate and sanitize voice (whitelist)
            if (isset($_POST['audio_press_ai_voice'])) {
                $allowed_voices = array('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer');
                $voice = sanitize_text_field($_POST['audio_press_ai_voice']);
                if (in_array($voice, $allowed_voices, true)) {
                    update_option('audio_press_ai_voice', $voice);
                }
            }
            
            // Model/Quality option removed - not used by server (Piper TTS is language-based, not model-based)
            
            // Checkbox values
            update_option('audio_press_ai_auto_embed', isset($_POST['audio_press_ai_auto_embed']) ? '1' : '0');
            update_option('audio_press_ai_auto_generate', isset($_POST['audio_press_ai_auto_generate']) ? '1' : '0');
            
            echo '<div class="notice notice-success"><p>' . esc_html__('Settings saved!', 'audio-press-ai') . '</p></div>';
        }
        
        // API Server URL is constant - always use the constant, not from options
        $api_server_url = AUDIO_PRESS_AI_API_URL;
        $voice = get_option('audio_press_ai_voice', 'nova');
        $auto_embed = get_option('audio_press_ai_auto_embed', '1');
        $auto_generate = get_option('audio_press_ai_auto_generate', '0');
        
        // Safely check Pro status with error handling
        try {
            $is_pro = $this->is_pro_user();
        } catch (Exception $e) {
            error_log('Audio-Press AI: Error checking Pro status: ' . $e->getMessage());
            $is_pro = false;
        }
        
        $dev_mode = defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true;
        
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <?php if ($dev_mode): ?>
                <div class="notice notice-info">
                    <p><strong>⚠️ <?php _e('DEV MODE ACTIVE', 'audio-press-ai'); ?></strong> - <?php _e('Testing without Pro license. Set AUDIO_PRESS_AI_DEV_MODE to false for production.', 'audio-press-ai'); ?></p>
                </div>
            <?php elseif (!$is_pro): ?>
                <div class="notice notice-warning">
                    <p><strong><?php _e('Upgrade to Pro', 'audio-press-ai'); ?></strong> - <?php _e('You need a Pro license to generate audio. Click "Upgrade to Pro" in the Freemius menu.', 'audio-press-ai'); ?></p>
                </div>
            <?php else: ?>
                <div class="notice notice-success">
                    <p><?php _e('✓ Pro license active', 'audio-press-ai'); ?></p>
                </div>
            <?php endif; ?>
            
            <form method="post" action="">
                <?php wp_nonce_field('audio_press_ai_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="audio_press_ai_voice"><?php _e('Default Voice', 'audio-press-ai'); ?></label>
                        </th>
                        <td>
                            <select id="audio_press_ai_voice" name="audio_press_ai_voice">
                                <option value="alloy" <?php selected($voice, 'alloy'); ?>>Alloy</option>
                                <option value="echo" <?php selected($voice, 'echo'); ?>>Echo</option>
                                <option value="fable" <?php selected($voice, 'fable'); ?>>Fable</option>
                                <option value="onyx" <?php selected($voice, 'onyx'); ?>>Onyx</option>
                                <option value="nova" <?php selected($voice, 'nova'); ?>>Nova</option>
                                <option value="shimmer" <?php selected($voice, 'shimmer'); ?>>Shimmer</option>
                            </select>
                            <p class="description">
                                <?php _e('Default voice setting (for compatibility). Note: Piper TTS uses language-specific voice models, so the voice is automatically selected based on the detected language. You can test different languages using the Test feature below.', 'audio-press-ai'); ?>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Test Languages', 'audio-press-ai'); ?></th>
                        <td>
                            <div id="audio-press-ai-test-section" style="padding: 15px; background: #f0f6fc; border: 1px solid #c3c4c7; border-radius: 4px;">
                                <p style="margin-top: 0;"><?php _e('Test different languages and voices with a sample text:', 'audio-press-ai'); ?></p>
                                <table style="width: 100%;">
                                    <tr>
                                        <td style="width: 50%; padding-right: 10px;">
                                            <label for="audio-press-ai-test-language" style="display: block; margin-bottom: 5px; font-weight: 600;"><?php _e('Language:', 'audio-press-ai'); ?></label>
                                            <select id="audio-press-ai-test-language" style="width: 100%; padding: 6px;">
                                                <option value="en" selected>English</option>
                                                <option value="es">Español (Spanish)</option>
                                                <option value="pt_PT">Português PT (Portuguese Portugal)</option>
                                                <option value="pt_BR">Português BR (Portuguese Brazil)</option>
                                                <option value="de">Deutsch (German)</option>
                                                <option value="nl_NL">Nederlands NL (Dutch Netherlands)</option>
                                                <option value="nl_BE">Nederlands BE (Dutch Belgium)</option>
                                                <option value="da">Dansk (Danish)</option>
                                                <option value="sv">Svenska (Swedish)</option>
                                                <option value="he">עברית (Hebrew)</option>
                                                <option value="ar">ערבית (Arabic)</option>
                                                <option value="ru">Русский (Russian)</option>
                                                <option value="zh">中文/日本語/한국어 (CJK)</option>
                                            </select>
                                        </td>
                                        <td style="width: 50%; padding-left: 10px;">
                                            <label for="audio-press-ai-test-voice" style="display: block; margin-bottom: 5px; font-weight: 600;"><?php _e('Voice:', 'audio-press-ai'); ?></label>
                                            <select id="audio-press-ai-test-voice" style="width: 100%; padding: 6px;">
                                                <!-- Will be populated dynamically based on language selection -->
                                            </select>
                                            <p class="description" style="margin-top: 5px; font-size: 11px; color: #646970;">
                                                <?php _e('Voice selection depends on the chosen language.', 'audio-press-ai'); ?>
                                            </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colspan="2" style="padding-top: 10px;">
                                            <label for="audio-press-ai-test-text" style="display: block; margin-bottom: 5px; font-weight: 600;"><?php _e('Test Text:', 'audio-press-ai'); ?></label>
                                            <textarea id="audio-press-ai-test-text" rows="3" style="width: 100%; padding: 6px;" placeholder="<?php esc_attr_e('Enter text to test...', 'audio-press-ai'); ?>"><?php esc_html_e('Hello! This is a test of the audio generation feature.', 'audio-press-ai'); ?></textarea>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td colspan="2" style="padding-top: 10px;">
                                            <button type="button" id="audio-press-ai-test-button" class="button button-secondary" <?php if (!$is_pro && !$dev_mode) echo 'disabled'; ?>>
                                                <?php _e('Test Audio Generation', 'audio-press-ai'); ?>
                                            </button>
                                            <span id="audio-press-ai-test-status" style="margin-left: 10px; display: none;"></span>
                                        </td>
                                    </tr>
                                    <tr id="audio-press-ai-test-result-row" style="display: none;">
                                        <td colspan="2" style="padding-top: 10px;">
                                            <div id="audio-press-ai-test-player" style="margin-top: 10px;"></div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Auto-embed Player', 'audio-press-ai'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" 
                                       name="audio_press_ai_auto_embed" 
                                       value="1" 
                                       <?php checked($auto_embed, '1'); ?> />
                                <?php _e('Automatically embed audio player at the top of posts that have audio', 'audio-press-ai'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Auto-generate Audio', 'audio-press-ai'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" 
                                       name="audio_press_ai_auto_generate" 
                                       value="1" 
                                       <?php checked($auto_generate, '1'); ?> />
                                <?php _e('Automatically generate audio when publishing a new post', 'audio-press-ai'); ?>
                            </label>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <script type="text/javascript">
        (function() {
            'use strict';
            
            // Define available voices for each language
            var languageVoices = {
                'en': [
                    { value: 'ljspeech', label: 'ljspeech (Default)' },
                    { value: 'kristin', label: 'kristin' },
                    { value: 'john', label: 'john' },
                    { value: 'bryce', label: 'bryce' }
                ],
                'es': [
                    { value: 'davefx', label: 'davefx (Default)' }
                ],
                'pt_PT': [
                    { value: 'tugao', label: 'tugao (Default)' }
                ],
                'pt_BR': [
                    { value: 'cadu', label: 'cadu (Default)' }
                ],
                'de': [
                    { value: 'thorsten-low', label: 'thorsten (Low - CC0)' },
                    { value: 'thorsten-high', label: 'thorsten (High)' }
                ],
                'nl_NL': [
                    { value: 'ronnie', label: 'ronnie (Default)' }
                ],
                'nl_BE': [
                    { value: 'rdh', label: 'rdh (Default)' },
                    { value: 'nathalie', label: 'nathalie' }
                ],
                'da': [
                    { value: 'talesyntese', label: 'talesyntese (Default)' }
                ],
                'sv': [
                    { value: 'nst', label: 'nst (Default)' }
                ],
                'he': [
                    { value: 'default', label: 'Default' }
                ],
                'ar': [
                    { value: 'default', label: 'Default' }
                ],
                'ru': [
                    { value: 'default', label: 'Default' }
                ],
                'zh': [
                    { value: 'default', label: 'Default' }
                ]
            };
            
            // Function to update voice options based on selected language
            function updateVoiceOptions() {
                var $languageSelect = jQuery('#audio-press-ai-test-language');
                var $voiceSelect = jQuery('#audio-press-ai-test-voice');
                
                // Check if elements exist
                if (!$languageSelect.length || !$voiceSelect.length) {
                    console.error('Audio-Press AI: Voice select elements not found');
                    return false;
                }
                
                var selectedLang = $languageSelect.val() || 'en';
                
                // Clear existing options
                $voiceSelect.empty();
                
                // Get voices for selected language
                var voices = languageVoices[selectedLang] || [{ value: 'default', label: 'Default' }];
                
                console.log('Audio-Press AI: Updating voice options for language:', selectedLang, 'voices:', voices);
                
                // Add options
                jQuery.each(voices, function(index, voice) {
                    $voiceSelect.append(jQuery('<option>', {
                        value: voice.value,
                        text: voice.label,
                        selected: index === 0 // Select first option by default
                    }));
                });
                
                console.log('Audio-Press AI: Voice options updated. Total options:', $voiceSelect.find('option').length);
                return true;
            }
            
            // Function to wait for jQuery and DOM elements
            function waitForElements(callback, maxAttempts) {
                maxAttempts = maxAttempts || 50;
                var attempts = 0;
                
                function check() {
                    attempts++;
                    if (typeof jQuery !== 'undefined' && jQuery('#audio-press-ai-test-language').length && jQuery('#audio-press-ai-test-voice').length) {
                        callback();
                    } else if (attempts < maxAttempts) {
                        setTimeout(check, 100);
                    } else {
                        console.error('Audio-Press AI: Failed to find elements after ' + maxAttempts + ' attempts');
                        // Try to initialize anyway
                        if (typeof jQuery !== 'undefined') {
                            callback();
                        }
                    }
                }
                
                check();
            }
            
            // Initialize when everything is ready
            waitForElements(function() {
                var $ = jQuery;
                console.log('Audio-Press AI: Test script loaded');
                
                // Initialize voice options for default language
                updateVoiceOptions();
                
                // Update voice options when language changes
                jQuery('#audio-press-ai-test-language').on('change', function() {
                    updateVoiceOptions();
                });
                
                var $testBtn = $('#audio-press-ai-test-button');
                
                if (!$testBtn.length) {
                    console.error('Audio-Press AI: Test button not found on page');
                    return;
                }
                
                console.log('Audio-Press AI: Test button found, binding click handler');
                
                $testBtn.on('click', function(e) {
                    e.preventDefault();
                    console.log('Audio-Press AI: Test button clicked');
                    
                    var $btn = $(this);
                    var $status = $('#audio-press-ai-test-status');
                    var $resultRow = $('#audio-press-ai-test-result-row');
                    var $player = $('#audio-press-ai-test-player');
                    
                    var language = $('#audio-press-ai-test-language').val();
                    var voice = $('#audio-press-ai-test-voice').val();
                    var text = $('#audio-press-ai-test-text').val().trim();
                    
                    console.log('Audio-Press AI: Test params - language:', language, 'voice:', voice, 'text length:', text.length);
                    
                    if (!text) {
                        alert('<?php echo esc_js(__('Please enter test text', 'audio-press-ai')); ?>');
                        return;
                    }
                    
                    $btn.prop('disabled', true);
                    $status.html('<span class="spinner is-active" style="float: none; margin: 0 5px 0 0;"></span><?php echo esc_js(__('Generating...', 'audio-press-ai')); ?>').show();
                    $resultRow.hide();
                    $player.empty();
                    
                    var ajaxUrl = typeof ajaxurl !== 'undefined' ? ajaxurl : '<?php echo esc_js(admin_url('admin-ajax.php')); ?>';
                    console.log('Audio-Press AI: Sending AJAX request to:', ajaxUrl);
                    
                    $.ajax({
                        url: ajaxUrl,
                        type: 'POST',
                        dataType: 'json',
                        data: {
                            action: 'audio_press_ai_test_generate',
                            language: language,
                            voice: voice,
                            text: text,
                            nonce: '<?php echo wp_create_nonce('audio_press_ai_test'); ?>'
                        },
                    success: function(response) {
                        $btn.prop('disabled', false);
                        if (response.success) {
                            $status.html('<span style="color: #00a32a;">✅ <?php echo esc_js(__('Success!', 'audio-press-ai')); ?></span>');
                            var audioUrl = response.data.audio_url;
                            var playerHtml = '<div class="audio-press-ai-custom-player">';
                            playerHtml += '<div class="player-controls">';
                            playerHtml += '<button class="play-pause-btn paused test-play-pause" type="button"></button>';
                            playerHtml += '<div class="player-info">';
                            playerHtml += '<div class="progress-container">';
                            playerHtml += '<div class="progress-bar-wrapper test-progress-wrapper">';
                            playerHtml += '<div class="progress-bar test-progress"></div>';
                            playerHtml += '</div>';
                            playerHtml += '</div>';
                            playerHtml += '<div class="time-display">';
                            playerHtml += '<span class="time-current test-time-current">0:00</span>';
                            playerHtml += '<span class="time-separator">/</span>';
                            playerHtml += '<span class="time-total test-time-total">0:00</span>';
                            playerHtml += '</div>';
                            playerHtml += '</div>';
                            playerHtml += '</div>';
                            playerHtml += '<audio class="test-audio-element" preload="metadata">';
                            playerHtml += '<source src="' + audioUrl + '" type="audio/wav">';
                            playerHtml += '<source src="' + audioUrl + '" type="audio/mpeg">';
                            playerHtml += '</audio>';
                            playerHtml += '</div>';
                            $player.html(playerHtml);
                            $resultRow.show();
                            
                            // Initialize player
                            var audio = $('.test-audio-element')[0];
                            var playPauseBtn = $('.test-play-pause');
                            var progressBar = $('.test-progress');
                            var progressWrapper = $('.test-progress-wrapper');
                            var timeCurrent = $('.test-time-current');
                            var timeTotal = $('.test-time-total');
                            
                            function formatTime(seconds) {
                                if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
                                var mins = Math.floor(seconds / 60);
                                var secs = Math.floor(seconds % 60);
                                return mins + ':' + (secs < 10 ? '0' : '') + secs;
                            }
                            
                            function updateTime() {
                                if (audio.duration) timeTotal.text(formatTime(audio.duration));
                                timeCurrent.text(formatTime(audio.currentTime));
                                if (audio.duration) {
                                    var percent = (audio.currentTime / audio.duration) * 100;
                                    progressBar.css('width', percent + '%');
                                }
                            }
                            
                            audio.addEventListener('loadedmetadata', function() {
                                timeTotal.text(formatTime(audio.duration));
                            });
                            audio.addEventListener('timeupdate', updateTime);
                            audio.addEventListener('loadeddata', updateTime);
                            
                            playPauseBtn.on('click', function() {
                                if (audio.paused) {
                                    audio.play();
                                    playPauseBtn.removeClass('paused').addClass('playing');
                                } else {
                                    audio.pause();
                                    playPauseBtn.removeClass('playing').addClass('paused');
                                }
                            });
                            
                            audio.addEventListener('play', function() {
                                playPauseBtn.removeClass('paused').addClass('playing');
                            });
                            audio.addEventListener('pause', function() {
                                playPauseBtn.removeClass('playing').addClass('paused');
                            });
                            
                            progressWrapper.on('click', function(e) {
                                if (!audio.duration) return;
                                var rect = this.getBoundingClientRect();
                                var x = e.clientX - rect.left;
                                var percent = Math.max(0, Math.min(1, x / rect.width));
                                audio.currentTime = percent * audio.duration;
                            });
                            
                            audio.load();
                        } else {
                            var errorMsg = response.data && response.data.message ? response.data.message : '<?php echo esc_js(__('Error', 'audio-press-ai')); ?>';
                            var isLanguageMismatch = response.data && response.data.language_mismatch;
                            
                            // Show language mismatch with special styling
                            if (isLanguageMismatch) {
                                var detectedLang = response.data.detected_language;
                                var selectedLang = response.data.selected_language;
                                var languageNames = {
                                    'en': 'English', 'es': 'Español (Spanish)', 'pt_PT': 'Português PT', 'pt_BR': 'Português BR',
                                    'de': 'Deutsch (German)', 'nl_NL': 'Nederlands NL', 'nl_BE': 'Nederlands BE',
                                    'da': 'Dansk (Danish)', 'sv': 'Svenska (Swedish)', 'he': 'עברית', 'ar': 'ערבית',
                                    'ru': 'Русский', 'zh': '中文/日本語/한국어'
                                };
                                
                                var detectedName = languageNames[detectedLang] || detectedLang;
                                var selectedName = languageNames[selectedLang] || selectedLang;
                                
                                // Update language selector to detected language
                                $('#audio-press-ai-test-language').val(detectedLang);
                                updateVoiceOptions(); // Update voice options for detected language
                                
                                $status.html('<div style="padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin-top: 10px;">' +
                                    '<strong style="color: #856404; display: block; margin-bottom: 8px;">⚠️ ' + errorMsg + '</strong>' +
                                    '<p style="margin: 0; font-size: 13px; color: #856404;">' +
                                    '<?php echo esc_js(__('The text appears to be in', 'audio-press-ai')); ?> <strong>' + detectedName + '</strong>, ' +
                                    '<?php echo esc_js(__('but you selected', 'audio-press-ai')); ?> <strong>' + selectedName + '</strong>. ' +
                                    '<?php echo esc_js(__('Language has been updated automatically. You can try again.', 'audio-press-ai')); ?>' +
                                    '</p>' +
                                    '</div>');
                            } else {
                                $status.html('<span style="color: #d63638;">❌ ' + errorMsg + '</span>');
                            }
                        }
                    },
                    error: function(xhr, status, error) {
                        $btn.prop('disabled', false);
                        console.error('Audio-Press AI Test Error:', status, error, xhr);
                        var errorMsg = '<?php echo esc_js(__('Network error', 'audio-press-ai')); ?>';
                        if (xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message) {
                            errorMsg = xhr.responseJSON.data.message;
                        }
                        $status.html('<span style="color: #d63638;">❌ ' + errorMsg + '</span>');
                    }
                });
            });
        })();
        </script>
        <?php
    }
    
    /**
     * Add meta box to post editor
     */
    public function add_meta_box() {
        $post_types = get_post_types(array('public' => true), 'names');
        foreach ($post_types as $post_type) {
            add_meta_box(
                'audio_press_ai_meta_box',
                __('Audio-Press AI', 'audio-press-ai'),
                array($this, 'render_meta_box'),
                $post_type,
                'side',
                'high'
            );
        }
    }
    
    /**
     * Render meta box content
     */
    public function render_meta_box($post) {
        // Check user can edit this post
        if (!current_user_can('edit_post', $post->ID)) {
            return;
        }
        
        // Sanitize post ID - allow 0 for new posts (auto-draft)
        $post_id = absint($post->ID);
        // Don't return early for new posts - we still want to show the meta box
        
        // Only get meta if post ID is valid (not 0)
        $audio_id = 0;
        $audio_url = '';
        $saved_language = '';
        if ($post_id > 0) {
            $audio_id = absint(get_post_meta($post_id, '_audio_press_mp3_id', true));
            $audio_url = $audio_id ? esc_url(wp_get_attachment_url($audio_id)) : '';
            $saved_language = get_post_meta($post_id, '_audio_press_ai_language', true);
        }
        
        wp_nonce_field('audio_press_ai_meta_box', 'audio_press_ai_nonce');
        
        $is_pro = $this->is_pro_user();
        $dev_mode = defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true;
        ?>
        <div id="audio-press-ai-container" data-post-id="<?php echo esc_attr($post_id); ?>">
            <?php if (!$is_pro && !$dev_mode): ?>
                <div style="padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 12px;">
                        <strong><?php _e('Upgrade Required', 'audio-press-ai'); ?></strong><br>
                        <?php _e('You need a Pro license to generate audio.', 'audio-press-ai'); ?>
                    </p>
                    <?php if (function_exists('apai_fs')): ?>
                        <a href="<?php echo esc_url(apai_fs()->get_upgrade_url()); ?>" class="button button-primary" style="margin-top: 8px; width: 100%;">
                            <?php _e('Upgrade to Pro', 'audio-press-ai'); ?>
                        </a>
                    <?php endif; ?>
                </div>
            <?php elseif ($dev_mode): ?>
                <div style="padding: 8px; background: #e7f3ff; border: 1px solid #0073aa; border-radius: 4px; margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 11px; color: #0073aa;">
                        <strong>⚠️ <?php _e('DEV MODE', 'audio-press-ai'); ?></strong> - <?php _e('Testing without Pro license', 'audio-press-ai'); ?>
                    </p>
                </div>
            <?php endif; ?>
            
            <?php if ($audio_url): ?>
                <?php 
                // Get language names mapping
                $language_names = array(
                    'en' => 'English',
                    'es' => 'Español (Spanish)',
                    'pt_PT' => 'Português PT (Portuguese Portugal)',
                    'pt_BR' => 'Português BR (Portuguese Brazil)',
                    'de' => 'Deutsch (German)',
                    'nl_NL' => 'Nederlands NL (Dutch Netherlands)',
                    'nl_BE' => 'Nederlands BE (Dutch Belgium)',
                    'da' => 'Dansk (Danish)',
                    'sv' => 'Svenska (Swedish)',
                    'he' => 'עברית (Hebrew)',
                    'ar' => 'ערבית (Arabic)',
                    'ru' => 'Русский (Russian)',
                    'zh' => '中文/日本語/한국어 (CJK)'
                );
                $detected_language_name = isset($language_names[$saved_language]) ? $language_names[$saved_language] : ($saved_language ? $saved_language : null);
                ?>
                <div id="audio-press-ai-player-wrapper">
                    <?php if ($detected_language_name): ?>
                        <div style="padding: 8px 10px; background: #f0f6fc; border: 1px solid #c3c4c7; border-radius: 4px; margin-bottom: 10px; font-size: 12px;">
                            <span style="color: #50575e;"><?php _e('Language:', 'audio-press-ai'); ?></span>
                            <strong style="color: #2271b1; margin-left: 5px;"><?php echo esc_html($detected_language_name); ?></strong>
                        </div>
                    <?php endif; ?>
                    <div class="audio-press-ai-custom-player">
                        <div class="player-controls">
                            <button class="play-pause-btn paused" id="audio-press-ai-play-pause" type="button"></button>
                            <div class="player-info">
                                <div class="progress-container">
                                    <div class="progress-bar-wrapper" id="audio-press-ai-progress-wrapper">
                                        <div class="progress-bar" id="audio-press-ai-progress"></div>
                                    </div>
                                </div>
                                <div class="time-display">
                                    <span class="time-current" id="audio-press-ai-time-current">0:00</span>
                                    <span class="time-separator">/</span>
                                    <span class="time-total" id="audio-press-ai-time-total">0:00</span>
                                </div>
                            </div>
                            <div class="player-speed-control">
                                <select id="audio-press-ai-speed-select" class="audio-speed-select" title="<?php esc_attr_e('Playback Speed', 'audio-press-ai'); ?>">
                                    <option value="0.5">0.5x</option>
                                    <option value="0.75">0.75x</option>
                                    <option value="1" selected>1x</option>
                                    <option value="1.25">1.25x</option>
                                    <option value="1.5">1.5x</option>
                                    <option value="1.75">1.75x</option>
                                    <option value="2">2x</option>
                                </select>
                            </div>
                        </div>
                        <audio id="audio-press-ai-audio-element" preload="metadata">
                            <source src="<?php echo esc_url($audio_url); ?>" type="audio/wav">
                            <source src="<?php echo esc_url($audio_url); ?>" type="audio/mpeg">
                            <?php _e('Your browser does not support the audio element.', 'audio-press-ai'); ?>
                        </audio>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" 
                                class="button button-secondary" 
                                id="audio-press-ai-regenerate"
                                <?php if (!$is_pro && !$dev_mode) echo 'disabled'; ?>>
                            <?php _e('Regenerate Audio', 'audio-press-ai'); ?>
                        </button>
                        <button type="button" 
                                class="button button-link-delete" 
                                id="audio-press-ai-delete">
                            <?php _e('Delete Audio', 'audio-press-ai'); ?>
                        </button>
                    </div>
                </div>
                <script>
                jQuery(document).ready(function($) {
                    if (typeof initExistingPlayer === 'function') {
                        initExistingPlayer();
                    } else {
                        // Fallback: wait for admin.js to load
                        setTimeout(function() {
                            if (typeof initExistingPlayer === 'function') {
                                initExistingPlayer();
                            }
                        }, 100);
                    }
                    
                    // Add speed control functionality
                    var speedSelect = jQuery('#audio-press-ai-speed-select');
                    if (speedSelect.length) {
                        speedSelect.off('change').on('change', function() {
                            var audio = jQuery('#audio-press-ai-audio-element')[0];
                            if (audio) {
                                var speed = parseFloat(jQuery(this).val());
                                if (!isNaN(speed) && speed > 0) {
                                    audio.playbackRate = speed;
                                    console.log('Audio speed changed to:', speed + 'x');
                                }
                            }
                        });
                        // Set initial speed to 1x
                        var audio = jQuery('#audio-press-ai-audio-element')[0];
                        if (audio) {
                            audio.playbackRate = 1;
                        }
                    }
                });
                </script>
            <?php else: ?>
                <button type="button" 
                        class="button button-primary button-large" 
                        id="audio-press-ai-generate" 
                        style="width: 100%;"
                        <?php if (!$is_pro && !(defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true)) echo 'disabled'; ?>>
                    <?php _e('Generate Audio Version (AI)', 'audio-press-ai'); ?>
                </button>
            <?php endif; ?>
            <div id="audio-press-ai-status" style="margin-top: 10px; display: none;">
                <p><span class="spinner is-active" style="float: none; margin: 0 5px 0 0;"></span>
                <span id="audio-press-ai-status-text"></span></p>
            </div>
        </div>
        <?php
    }
    
    /**
     * AJAX handler for generating audio
     */
    public function ajax_generate_audio() {
        // Verify nonce
        check_ajax_referer('audio_press_ai_meta_box', 'nonce');
        
        // Check user capabilities
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        // Validate and sanitize post ID
        $post_id = 0;
        if (isset($_POST['post_id']) && !empty($_POST['post_id']) && is_numeric($_POST['post_id'])) {
            $post_id = absint($_POST['post_id']);
        }
        
        // If post_id is still 0, try to get from WordPress context
        if (!$post_id) {
            global $post;
            if (isset($post) && $post && isset($post->ID) && $post->ID > 0) {
                $post_id = absint($post->ID);
            } else {
                $the_id = get_the_ID();
                if ($the_id && $the_id > 0) {
                    $post_id = absint($the_id);
                }
            }
        }
        
        // Final validation - post_id must be valid
        if (!$post_id || $post_id <= 0) {
            wp_send_json_error(array('message' => __('Post ID is required. Please save the post first as a draft or publish it.', 'audio-press-ai')));
        }
        
        // Check user can edit this specific post
        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(array('message' => __('You do not have permission to edit this post', 'audio-press-ai')));
        }
        
        // Verify post exists
        $post = get_post($post_id);
        if (!$post) {
            wp_send_json_error(array('message' => __('Post not found', 'audio-press-ai')));
        }
        
        // Check Pro license (unless in dev mode)
        if (!(defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true)) {
            if (!$this->is_pro_user()) {
                wp_send_json_error(array('message' => __('Pro license required. Please upgrade.', 'audio-press-ai')));
            }
        }
        
        $license_key = $this->get_license_key();
        if (!$license_key) {
            // In dev mode, use TEST key if get_license_key fails
            if (defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true) {
                $license_key = 'TEST';
            } else {
                wp_send_json_error(array('message' => __('License key not found', 'audio-press-ai')));
            }
        }
        
        // Get and validate options
        $voice = get_option('audio_press_ai_voice', 'nova');
        $allowed_voices = array('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer');
        if (!in_array($voice, $allowed_voices, true)) {
            $voice = 'nova'; // Default fallback
        }
        
        // Model/Quality is not used by server (Piper TTS is language-based)
        // API Server URL is constant
        $api_server_url = AUDIO_PRESS_AI_API_URL;
        // Validate URL
        $api_server_url = esc_url_raw($api_server_url);
        if (empty($api_server_url) || !filter_var($api_server_url, FILTER_VALIDATE_URL)) {
            wp_send_json_error(array('message' => __('Invalid API server URL', 'audio-press-ai')));
        }
        
        // Get post content - properly handle Gutenberg blocks
        $post = get_post($post_id);
        if (!$post) {
            wp_send_json_error(array('message' => __('Post not found', 'audio-press-ai')));
        }
        
        error_log('Audio-Press AI [DEBUG]: Post ID: ' . $post_id);
        error_log('Audio-Press AI [DEBUG]: Post type: ' . $post->post_type);
        error_log('Audio-Press AI [DEBUG]: Post status: ' . $post->post_status);
        error_log('Audio-Press AI [DEBUG]: Post content (raw field): ' . strlen($post->post_content) . ' chars');
        
        // Get raw content
        $content = $post->post_content;
        
        if (empty($content)) {
            wp_send_json_error(array('message' => __('Post content is empty', 'audio-press-ai')));
        }
        
        // Parse Gutenberg blocks if available
        if (function_exists('parse_blocks')) {
            $blocks = parse_blocks($content);
            $parsed_content = '';
            
            foreach ($blocks as $block) {
                // Extract text content from blocks
                if (!empty($block['blockName']) && !empty($block['innerHTML'])) {
                    $parsed_content .= $block['innerHTML'] . "\n";
                } elseif (!empty($block['innerHTML'])) {
                    $parsed_content .= $block['innerHTML'] . "\n";
                } elseif (isset($block['innerContent']) && is_array($block['innerContent'])) {
                    foreach ($block['innerContent'] as $inner) {
                        if (is_string($inner)) {
                            $parsed_content .= $inner . "\n";
                        }
                    }
                }
            }
            
            if (!empty($parsed_content)) {
                $content = $parsed_content;
            }
        }
        
        error_log('Audio-Press AI [DEBUG]: After parse_blocks length: ' . strlen($content) . ' chars');
        error_log('Audio-Press AI [DEBUG]: After parse_blocks preview (first 300): ' . substr($content, 0, 300));
        
        // Apply the_content filters to render blocks and shortcodes
        $content = apply_filters('the_content', $content);
        
        error_log('Audio-Press AI [DEBUG]: After apply_filters length: ' . strlen($content) . ' chars');
        
        // Now strip all HTML tags
        $content = wp_strip_all_tags($content);
        
        // Decode HTML entities (like &nbsp;, &quot;, etc.)
        $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        error_log('Audio-Press AI [DEBUG]: After strip_tags length: ' . strlen($content) . ' chars');
        error_log('Audio-Press AI [DEBUG]: After strip_tags preview (first 300): ' . substr($content, 0, 300));
        
        // Normalize whitespace but keep line breaks for better TTS
        $content = preg_replace('/[ \t]+/', ' ', $content); // Replace multiple spaces/tabs with single space
        $content = preg_replace('/\n\s*\n/', "\n\n", $content); // Normalize multiple newlines
        $content = trim($content);
        
        error_log('Audio-Press AI [DEBUG]: After normalization length: ' . strlen($content) . ' chars');
        error_log('Audio-Press AI [DEBUG]: After normalization: ' . substr($content, 0, 200));
        
        // Limit content length to prevent abuse (max 50,000 characters)
        if (strlen($content) > 50000) {
            $content = substr($content, 0, 50000);
        }
        
        // Final check: ensure content has actual text (not just whitespace)
        if (empty($content) || strlen(trim($content)) === 0) {
            wp_send_json_error(array('message' => __('Post content is empty after processing', 'audio-press-ai')));
        }
        
        // Debug: log final content that will be sent to server
        error_log('Audio-Press AI [DEBUG]: Final content to send: length=' . strlen($content) . ' chars');
        error_log('Audio-Press AI [DEBUG]: Final content preview: ' . substr($content, 0, 200));
        
        // Delete old audio if exists (regeneration)
        $old_audio_id = absint(get_post_meta($post_id, '_audio_press_mp3_id', true));
        if ($old_audio_id) {
            // Verify attachment exists and belongs to this post
            $old_attachment = get_post($old_audio_id);
            if ($old_attachment && $old_attachment->post_parent == $post_id) {
                wp_delete_attachment($old_audio_id, true);
            }
        }
        
        // Get WordPress user ID for tracking
        $wp_user_id = get_current_user_id();
        
        // Get language if provided (for override)
        $language = isset($_POST['language']) ? sanitize_text_field($_POST['language']) : null;
        
        // Check language mismatch if language is explicitly provided
        if ($language) {
            $api_server_url_temp = AUDIO_PRESS_AI_API_URL;
            $api_server_url_temp = esc_url_raw(rtrim($api_server_url_temp, '/'));
            
            if (!empty($api_server_url_temp) && filter_var($api_server_url_temp, FILTER_VALIDATE_URL)) {
                // Call detect-language endpoint to check if text language matches selected language
                $detect_response = wp_remote_request($api_server_url_temp . '/detect-language', array(
                    'method' => 'POST',
                    'headers' => array('Content-Type' => 'application/json'),
                    'body' => json_encode(array('text' => substr($content, 0, 1000)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), // Use first 1000 chars for detection
                    'timeout' => 10,
                    'sslverify' => true,
                ));
                
                if (!is_wp_error($detect_response)) {
                    $detect_body = wp_remote_retrieve_body($detect_response);
                    $detect_data = json_decode($detect_body, true);
                    
                    if (isset($detect_data['detected']) && $detect_data['detected'] !== $language) {
                        // Language mismatch detected
                        $language_names = array(
                            'en' => 'English',
                            'es' => 'Español (Spanish)',
                            'pt_PT' => 'Português PT (Portuguese Portugal)',
                            'pt_BR' => 'Português BR (Portuguese Brazil)',
                            'de' => 'Deutsch (German)',
                            'nl_NL' => 'Nederlands NL (Dutch Netherlands)',
                            'nl_BE' => 'Nederlands BE (Dutch Belgium)',
                            'da' => 'Dansk (Danish)',
                            'sv' => 'Svenska (Swedish)',
                            'he' => 'עברית (Hebrew)',
                            'ar' => 'ערבית (Arabic)',
                            'ru' => 'Русский (Russian)',
                            'zh' => '中文/日本語/한국어 (CJK)'
                        );
                        
                        $detected_name = isset($language_names[$detect_data['detected']]) ? $language_names[$detect_data['detected']] : $detect_data['detected'];
                        $selected_name = isset($language_names[$language]) ? $language_names[$language] : $language;
                        
                        wp_send_json_error(array(
                            'message' => sprintf(
                                __('⚠️ Language mismatch detected! The text appears to be in %s, but you selected %s. Please select the correct language for best audio quality.', 'audio-press-ai'),
                                $detected_name,
                                $selected_name
                            ),
                            'detected_language' => $detect_data['detected'],
                            'selected_language' => $language,
                            'language_mismatch' => true
                        ));
                    }
                }
            }
        }
        
        // Call remote API server
        // Note: $model parameter is kept for backward compatibility but not used by server (Piper TTS is language-based)
        $response = $this->call_remote_api($api_server_url, $license_key, $wp_user_id, 'tts-1-hd', $voice, $content, $language, $post_id);
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        $response_body = wp_remote_retrieve_body($response);
        if (empty($response_body)) {
            wp_send_json_error(array('message' => __('Empty response from server', 'audio-press-ai')));
        }
        
        $response_data = json_decode($response_body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            wp_send_json_error(array('message' => __('Invalid JSON response from server', 'audio-press-ai')));
        }
        
        if (isset($response_data['error'])) {
            $error_message = is_string($response_data['error']) ? sanitize_text_field($response_data['error']) : __('Unknown error', 'audio-press-ai');
            wp_send_json_error(array('message' => $error_message));
        }
        
        // Check if server sent audio data directly (new method) or URL (old method)
        if (isset($response_data['audio_data'])) {
            // New method: Audio sent as base64 in response
            $audio_base64 = $response_data['audio_data'];
            
            // Decode base64 to binary
            $file_contents = base64_decode($audio_base64, true);
            if ($file_contents === false) {
                wp_send_json_error(array('message' => __('Failed to decode audio data', 'audio-press-ai')));
            }
            
            // Limit file size (max 25MB)
            if (strlen($file_contents) > 26214400) {
                wp_send_json_error(array('message' => __('Audio file is too large', 'audio-press-ai')));
            }
            
            // Generate filename
            $post_title = sanitize_file_name(get_the_title($post_id));
            if (empty($post_title)) {
                $post_title = 'post-' . $post_id;
            }
            $filename = isset($response_data['filename']) ? sanitize_file_name($response_data['filename']) : ($post_title . '-audio-' . time() . '.mp3');
            
        } elseif (isset($response_data['audio_url'])) {
            // Old method: Download from URL (backwards compatibility)
            $audio_url = esc_url_raw($response_data['audio_url']);
            if (empty($audio_url) || !filter_var($audio_url, FILTER_VALIDATE_URL)) {
                wp_send_json_error(array('message' => __('Invalid audio URL from server', 'audio-press-ai')));
            }
            
            // Download audio file from remote server
            $audio_file = download_url($audio_url);
            
            if (is_wp_error($audio_file)) {
                wp_send_json_error(array('message' => __('Failed to download audio file', 'audio-press-ai') . ': ' . $audio_file->get_error_message()));
            }
            
            // Verify file exists and is readable
            if (!file_exists($audio_file) || !is_readable($audio_file)) {
                wp_send_json_error(array('message' => __('Downloaded file is not accessible', 'audio-press-ai')));
            }
            
            // Read file with error handling
            $file_contents = @file_get_contents($audio_file);
            if ($file_contents === false) {
                @unlink($audio_file); // Clean up on error
                wp_send_json_error(array('message' => __('Failed to read downloaded file', 'audio-press-ai')));
            }
            
            // Limit file size (max 25MB)
            if (strlen($file_contents) > 26214400) {
                @unlink($audio_file);
                wp_send_json_error(array('message' => __('Audio file is too large', 'audio-press-ai')));
            }
            
            @unlink($audio_file); // Clean up temp file
            
            // Generate filename
            $post_title = sanitize_file_name(get_the_title($post_id));
            if (empty($post_title)) {
                $post_title = 'post-' . $post_id;
            }
            $filename = $post_title . '-audio-' . time() . '.mp3';
            
        } else {
            wp_send_json_error(array('message' => __('Invalid response from server: missing audio data or URL', 'audio-press-ai')));
        }
        
        // Debug: Log file size
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Audio-Press AI: Received audio data size: ' . strlen($file_contents) . ' bytes');
        }
        
        // Save to WordPress media library
        $upload = wp_upload_bits($filename, null, $file_contents);
        
        if ($upload['error']) {
            wp_send_json_error(array('message' => __('Failed to save audio file', 'audio-press-ai')));
        }
        
        // Debug: Log saved file size
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $saved_size = file_exists($upload['file']) ? filesize($upload['file']) : 0;
            error_log('Audio-Press AI: Saved file size: ' . $saved_size . ' bytes, path: ' . $upload['file']);
        }
        
        // Get mime type from WordPress based on file extension
        $wp_file_type = wp_check_filetype($filename, null);
        $mime_type = $wp_file_type['type'];
        
        // Fallback to server's mime type if WordPress couldn't detect it
        if (!$mime_type && isset($response_data['audio_mime'])) {
            $mime_type = sanitize_text_field($response_data['audio_mime']);
        }
        
        // Final fallback
        if (!$mime_type) {
            $mime_type = 'audio/wav';
        }
        
        // Create attachment
        $attachment = array(
            'post_mime_type' => $mime_type,
            'post_title' => sanitize_text_field($post_title . ' - Audio'),
            'post_content' => '',
            'post_status' => 'inherit',
            'post_author' => get_current_user_id()
        );
        
        $attachment_id = wp_insert_attachment($attachment, $upload['file'], $post_id);
        
        if (is_wp_error($attachment_id)) {
            wp_send_json_error(array('message' => __('Failed to create attachment', 'audio-press-ai')));
        }
        
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        require_once(ABSPATH . 'wp-admin/includes/media.php');
        
        $attach_data = wp_generate_attachment_metadata($attachment_id, $upload['file']);
        
        // For audio files, WordPress may not always extract metadata correctly
        // Try wp_read_audio_metadata() which uses getID3 internally
        if (empty($attach_data['length']) || empty($attach_data['length_formatted'])) {
            if (function_exists('wp_read_audio_metadata')) {
                $audio_meta = wp_read_audio_metadata($upload['file']);
                
                if (!empty($audio_meta['length']) || !empty($audio_meta['length_formatted'])) {
                    $attach_data = array_merge($attach_data, $audio_meta);
                    
                    if (defined('WP_DEBUG') && WP_DEBUG) {
                        error_log('Audio-Press AI: Extracted audio metadata: length=' . ($audio_meta['length'] ?? 'N/A') . ' seconds');
                    }
                }
            }
        }
        
        // Fallback: If still no duration, try to extract it manually
        if (empty($attach_data['length']) && file_exists($upload['file'])) {
            // Try using getID3 class directly (WordPress includes it)
            $getid3_path = ABSPATH . WPINC . '/ID3/getid3.php';
            if (file_exists($getid3_path)) {
                require_once($getid3_path);
                
                if (class_exists('getID3')) {
                    try {
                        $getID3 = new getID3();
                        $file_info = @$getID3->analyze($upload['file']);
                        
                        if (isset($file_info['playtime_seconds']) && $file_info['playtime_seconds'] > 0) {
                            $attach_data['length'] = (int) round($file_info['playtime_seconds']);
                            $attach_data['length_formatted'] = gmdate('i:s', $attach_data['length']);
                            
                            if (defined('WP_DEBUG') && WP_DEBUG) {
                                error_log('Audio-Press AI: Extracted duration using getID3 directly: ' . $attach_data['length'] . ' seconds');
                            }
                        }
                    } catch (Exception $e) {
                        if (defined('WP_DEBUG') && WP_DEBUG) {
                            error_log('Audio-Press AI: getID3 error: ' . $e->getMessage());
                        }
                    }
                }
            }
        }
        
        // Debug: Log final metadata
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Audio-Press AI: Final metadata: ' . print_r($attach_data, true));
        }
        
        wp_update_attachment_metadata($attachment_id, $attach_data);
        
        // Save attachment ID to post meta
        update_post_meta($post_id, '_audio_press_mp3_id', $attachment_id);
        
        // Save language that was used (detected or selected)
        if ($language) {
            update_post_meta($post_id, '_audio_press_ai_language', $language);
        } else {
            // If no language was provided, detect it from content
            $clean_content = wp_strip_all_tags($content);
            $clean_content = do_shortcode($clean_content);
            $clean_content = wp_strip_all_tags($clean_content);
            
            // Call detect endpoint to get language
            $detect_response = wp_remote_request($api_server_url . '/detect-language', array(
                'method' => 'POST',
                'headers' => array('Content-Type' => 'application/json'),
                'body' => json_encode(array('text' => $clean_content), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'timeout' => 10,
                'sslverify' => true,
            ));
            
            if (!is_wp_error($detect_response)) {
                $detect_body = wp_remote_retrieve_body($detect_response);
                $detect_data = json_decode($detect_body, true);
                if (isset($detect_data['detected'])) {
                    update_post_meta($post_id, '_audio_press_ai_language', $detect_data['detected']);
                }
            }
        }
        
        wp_send_json_success(array(
            'audio_url' => wp_get_attachment_url($attachment_id),
            'message' => __('Audio generated successfully!', 'audio-press-ai'),
            'usage' => isset($response_data['usage']) ? $response_data['usage'] : null,
            'generate_count' => isset($response_data['usage']['generate_count']) ? $response_data['usage']['generate_count'] : null,
            'language' => $language ? $language : (isset($detect_data['detected']) ? $detect_data['detected'] : null)
        ));
    }
    
    /**
     * AJAX handler for deleting audio
     */
    public function ajax_delete_audio() {
        // Verify nonce
        check_ajax_referer('audio_press_ai_meta_box', 'nonce');
        
        // Check user capabilities
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        // Validate and sanitize post ID
        if (!isset($_POST['post_id'])) {
            wp_send_json_error(array('message' => __('Post ID is required', 'audio-press-ai')));
        }
        
        $post_id = absint($_POST['post_id']);
        if (!$post_id || !is_numeric($_POST['post_id'])) {
            wp_send_json_error(array('message' => __('Invalid post ID', 'audio-press-ai')));
        }
        
        // Check user can edit this specific post
        if (!current_user_can('edit_post', $post_id)) {
            wp_send_json_error(array('message' => __('You do not have permission to edit this post', 'audio-press-ai')));
        }
        
        // Get and validate audio ID
        $audio_id = absint(get_post_meta($post_id, '_audio_press_mp3_id', true));
        if ($audio_id) {
            // Verify attachment exists and belongs to this post
            $attachment = get_post($audio_id);
            if ($attachment && $attachment->post_parent == $post_id) {
                wp_delete_attachment($audio_id, true);
                delete_post_meta($post_id, '_audio_press_mp3_id');
                delete_post_meta($post_id, '_audio_press_ai_language'); // Delete language info too
            }
        }
        
        wp_send_json_success(array('message' => __('Audio deleted successfully', 'audio-press-ai')));
    }
    
    /**
     * AJAX handler for detecting language
     */
    public function ajax_detect_language() {
        // Verify nonce
        check_ajax_referer('audio_press_ai_meta_box', 'nonce');
        
        // Check user capabilities
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        // Validate and sanitize post ID
        if (!isset($_POST['post_id'])) {
            wp_send_json_error(array('message' => __('Post ID is required', 'audio-press-ai')));
        }
        
        $post_id = absint($_POST['post_id']);
        if (!$post_id || !is_numeric($_POST['post_id'])) {
            wp_send_json_error(array('message' => __('Invalid post ID', 'audio-press-ai')));
        }
        
        // Get post content
        $content = get_post_field('post_content', $post_id);
        
        if (empty($content)) {
            wp_send_json_error(array('message' => __('Post content is empty', 'audio-press-ai')));
        }
        
        // Clean content: remove HTML, shortcodes, etc.
        $content = wp_strip_all_tags($content);
        $content = do_shortcode($content);
        $content = wp_strip_all_tags($content);
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            wp_send_json_error(array('message' => __('Post content is empty after processing', 'audio-press-ai')));
        }
        
        $api_server_url = AUDIO_PRESS_AI_API_URL;
        $api_server_url = esc_url_raw(rtrim($api_server_url, '/'));
        
        if (empty($api_server_url) || !filter_var($api_server_url, FILTER_VALIDATE_URL)) {
            wp_send_json_error(array('message' => __('Invalid API server URL', 'audio-press-ai')));
        }
        
        $url = $api_server_url . '/detect-language';
        
        $args = array(
            'method' => 'POST',
            'headers' => array(
                'Content-Type' => 'application/json',
            ),
            'body' => json_encode(array('text' => $content), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'timeout' => 30,
            'sslverify' => true,
        );
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        $response_body = wp_remote_retrieve_body($response);
        $response_data = json_decode($response_body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE || isset($response_data['error'])) {
            wp_send_json_error(array('message' => isset($response_data['error']) ? $response_data['error'] : __('Failed to detect language', 'audio-press-ai')));
        }
        
        wp_send_json_success($response_data);
    }
    
    /**
     * AJAX handler for test audio generation (from settings page)
     */
    public function ajax_test_generate() {
        // Verify nonce
        check_ajax_referer('audio_press_ai_test', 'nonce');
        
        // Check user capabilities
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        // Check Pro license (unless in dev mode)
        if (!(defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true)) {
            if (!$this->is_pro_user()) {
                wp_send_json_error(array('message' => __('Pro license required. Please upgrade.', 'audio-press-ai')));
            }
        }
        
        $license_key = $this->get_license_key();
        if (!$license_key) {
            // In dev mode, use TEST key if get_license_key fails
            if (defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true) {
                $license_key = 'TEST';
            } else {
                wp_send_json_error(array('message' => __('License key not found', 'audio-press-ai')));
            }
        }
        
        // Get and validate test parameters
        $language = isset($_POST['language']) ? sanitize_text_field($_POST['language']) : null;
        $voice = isset($_POST['voice']) ? sanitize_text_field($_POST['voice']) : null;
        
        // Get text - use wp_unslash and strip_tags to preserve special characters needed for TTS
        $text = isset($_POST['text']) ? wp_unslash($_POST['text']) : '';
        // Strip HTML tags but preserve text content
        $text = wp_strip_all_tags($text);
        // Trim whitespace
        $text = trim($text);
        
        if (empty($text)) {
            wp_send_json_error(array('message' => __('Test text is required', 'audio-press-ai')));
        }
        
        // Limit test text length (max 500 characters for testing)
        if (strlen($text) > 500) {
            $text = substr($text, 0, 500);
        }
        
        // Check language mismatch: detect text language and warn if it doesn't match selected language
        if ($language) {
            $api_server_url = AUDIO_PRESS_AI_API_URL;
            $api_server_url = esc_url_raw(rtrim($api_server_url, '/'));
            
            if (!empty($api_server_url) && filter_var($api_server_url, FILTER_VALIDATE_URL)) {
                // Call detect-language endpoint to check if text language matches selected language
                $detect_response = wp_remote_request($api_server_url . '/detect-language', array(
                    'method' => 'POST',
                    'headers' => array('Content-Type' => 'application/json'),
                    'body' => json_encode(array('text' => $text), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'timeout' => 10,
                    'sslverify' => true,
                ));
                
                if (!is_wp_error($detect_response)) {
                    $detect_body = wp_remote_retrieve_body($detect_response);
                    $detect_data = json_decode($detect_body, true);
                    
                    if (isset($detect_data['detected']) && $detect_data['detected'] !== $language) {
                        // Language mismatch detected
                        $language_names = array(
                            'en' => 'English',
                            'es' => 'Español (Spanish)',
                            'pt_PT' => 'Português PT (Portuguese Portugal)',
                            'pt_BR' => 'Português BR (Portuguese Brazil)',
                            'de' => 'Deutsch (German)',
                            'nl_NL' => 'Nederlands NL (Dutch Netherlands)',
                            'nl_BE' => 'Nederlands BE (Dutch Belgium)',
                            'da' => 'Dansk (Danish)',
                            'sv' => 'Svenska (Swedish)',
                            'he' => 'עברית (Hebrew)',
                            'ar' => 'ערבית (Arabic)',
                            'ru' => 'Русский (Russian)',
                            'zh' => '中文/日本語/한국어 (CJK)'
                        );
                        
                        $detected_name = isset($language_names[$detect_data['detected']]) ? $language_names[$detect_data['detected']] : $detect_data['detected'];
                        $selected_name = isset($language_names[$language]) ? $language_names[$language] : $language;
                        
                        wp_send_json_error(array(
                            'message' => sprintf(
                                __('⚠️ Language mismatch detected! The text appears to be in %s, but you selected %s. Please select the correct language for best results.', 'audio-press-ai'),
                                $detected_name,
                                $selected_name
                            ),
                            'detected_language' => $detect_data['detected'],
                            'selected_language' => $language,
                            'language_mismatch' => true
                        ));
                    }
                }
            }
        }
        
        // API Server URL is constant
        $api_server_url = AUDIO_PRESS_AI_API_URL;
        $api_server_url = esc_url_raw($api_server_url);
        if (empty($api_server_url) || !filter_var($api_server_url, FILTER_VALIDATE_URL)) {
            wp_send_json_error(array('message' => __('Invalid API server URL', 'audio-press-ai')));
        }
        
        // Use a dummy post ID for testing (0 or -1)
        $test_post_id = -1;
        
        // Call remote API server
        // Note: $model and $voice parameters are sent but server uses language to select model
        // The voice parameter is sent for future server support of voice selection
        $response = $this->call_remote_api($api_server_url, $license_key, get_current_user_id(), 'tts-1-hd', 'nova', $text, $language, $test_post_id, $voice);
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        $response_body = wp_remote_retrieve_body($response);
        if (empty($response_body)) {
            wp_send_json_error(array('message' => __('Empty response from server', 'audio-press-ai')));
        }
        
        $response_data = json_decode($response_body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            wp_send_json_error(array('message' => __('Invalid JSON response from server', 'audio-press-ai')));
        }
        
        if (isset($response_data['error'])) {
            $error_message = is_string($response_data['error']) ? sanitize_text_field($response_data['error']) : __('Unknown error', 'audio-press-ai');
            wp_send_json_error(array('message' => $error_message));
        }
        
        // Check if server sent audio data directly (new method) or URL (old method)
        if (isset($response_data['audio_data'])) {
            // New method: Audio sent as base64 in response
            $audio_base64 = $response_data['audio_data'];
            
            // Decode base64 to binary
            $file_contents = base64_decode($audio_base64, true);
            if ($file_contents === false) {
                wp_send_json_error(array('message' => __('Failed to decode audio data', 'audio-press-ai')));
            }
            
            // Limit file size (max 25MB)
            if (strlen($file_contents) > 26214400) {
                wp_send_json_error(array('message' => __('Audio file is too large', 'audio-press-ai')));
            }
            
            // Generate filename for test
            $filename = 'test-audio-' . time() . '.mp3';
            
        } elseif (isset($response_data['audio_url'])) {
            // Old method: Download from URL (backwards compatibility)
            $audio_url = esc_url_raw($response_data['audio_url']);
            if (empty($audio_url) || !filter_var($audio_url, FILTER_VALIDATE_URL)) {
                wp_send_json_error(array('message' => __('Invalid audio URL from server', 'audio-press-ai')));
            }
            
            // Download audio file from remote server
            $audio_file = download_url($audio_url);
            
            if (is_wp_error($audio_file)) {
                wp_send_json_error(array('message' => __('Failed to download audio file', 'audio-press-ai') . ': ' . $audio_file->get_error_message()));
            }
            
            // Verify file exists and is readable
            if (!file_exists($audio_file) || !is_readable($audio_file)) {
                wp_send_json_error(array('message' => __('Downloaded file is not accessible', 'audio-press-ai')));
            }
            
            // Read file with error handling
            $file_contents = @file_get_contents($audio_file);
            if ($file_contents === false) {
                @unlink($audio_file); // Clean up on error
                wp_send_json_error(array('message' => __('Failed to read downloaded file', 'audio-press-ai')));
            }
            
            // Limit file size (max 25MB)
            if (strlen($file_contents) > 26214400) {
                @unlink($audio_file);
                wp_send_json_error(array('message' => __('Audio file is too large', 'audio-press-ai')));
            }
            
            @unlink($audio_file); // Clean up temp file
            
            // Generate filename for test
            $filename = 'test-audio-' . time() . '.mp3';
            
        } else {
            wp_send_json_error(array('message' => __('Invalid response from server: missing audio data or URL', 'audio-press-ai')));
        }
        
        // Save to WordPress media library (temporary - will be cleaned up)
        $upload = wp_upload_bits($filename, null, $file_contents);
        
        if ($upload['error']) {
            wp_send_json_error(array('message' => __('Failed to save audio file', 'audio-press-ai')));
        }
        
        // Get mime type
        $wp_file_type = wp_check_filetype($filename, null);
        $mime_type = $wp_file_type['type'];
        
        // Fallback to server's mime type if WordPress couldn't detect it
        if (!$mime_type && isset($response_data['audio_mime'])) {
            $mime_type = sanitize_text_field($response_data['audio_mime']);
        }
        
        // Final fallback
        if (!$mime_type) {
            $mime_type = 'audio/wav';
        }
        
        // Create attachment (without post parent - it's a test file)
        $attachment = array(
            'post_mime_type' => $mime_type,
            'post_title' => sanitize_text_field('Test Audio - ' . date('Y-m-d H:i:s')),
            'post_content' => '',
            'post_status' => 'inherit',
            'post_author' => get_current_user_id()
        );
        
        $attachment_id = wp_insert_attachment($attachment, $upload['file'], 0);
        
        if (is_wp_error($attachment_id)) {
            wp_send_json_error(array('message' => __('Failed to create attachment', 'audio-press-ai')));
        }
        
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        
        $attach_data = wp_generate_attachment_metadata($attachment_id, $upload['file']);
        wp_update_attachment_metadata($attachment_id, $attach_data);
        
        // Return audio URL (the file will be cleaned up later by WordPress cleanup routines)
        wp_send_json_success(array(
            'audio_url' => wp_get_attachment_url($attachment_id),
            'message' => __('Test audio generated successfully!', 'audio-press-ai')
        ));
    }
    
    /**
     * Call remote API server
     */
    private function call_remote_api($api_url, $license_key, $wp_user_id, $model, $voice, $text, $language = null, $post_id = null, $voice_name = null) {
        // Validate and sanitize URL
        $base_url = esc_url_raw(rtrim($api_url, '/'));
        if (empty($base_url) || !filter_var($base_url, FILTER_VALIDATE_URL)) {
            return new WP_Error('invalid_url', __('Invalid API server URL', 'audio-press-ai'));
        }
        
        $url = $base_url . '/generate';
        
        // Sanitize all inputs
        // Note: text is already cleaned in ajax_generate_audio, so we send it as-is
        // to preserve all characters needed for TTS
        $body = array(
            'license_key' => sanitize_text_field($license_key),
            'wp_user_id' => absint($wp_user_id),
            'model' => sanitize_text_field($model),
            'voice' => sanitize_text_field($voice),
            'text' => $text // Send text as-is (already cleaned in ajax_generate_audio)
        );
        
        // Add language if provided
        if ($language) {
            $body['language'] = sanitize_text_field($language);
        }
        // Add voice_name if provided (for voice selection within language)
        if ($voice_name) {
            $body['voice_name'] = sanitize_text_field($voice_name);
        }
        // Always send post_id (required by server for DB tracking)
        if ($post_id) {
            $body['post_id'] = absint($post_id);
        } else {
            // If post_id is missing, try to get from global $post
            global $post;
            if (isset($post) && $post && isset($post->ID)) {
                $body['post_id'] = absint($post->ID);
            } else {
                // Last resort: try get_the_ID()
                $the_id = get_the_ID();
                if ($the_id) {
                    $body['post_id'] = absint($the_id);
                }
            }
        }
        
        // Validate text length
        if (empty($body['text']) || strlen($body['text']) > 50000) {
            error_log('Audio-Press AI [DEBUG]: Text validation failed - empty: ' . (empty($body['text']) ? 'yes' : 'no') . ', length: ' . strlen($body['text']));
            return new WP_Error('invalid_text', __('Text is empty or too long', 'audio-press-ai'));
        }
        
        // Debug: log what we're about to send
        error_log('Audio-Press AI [DEBUG]: Sending to server - text length: ' . strlen($body['text']) . ' chars');
        error_log('Audio-Press AI [DEBUG]: Text to send (first 200 chars): ' . substr($body['text'], 0, 200));
        error_log('Audio-Press AI [DEBUG]: Text to send (last 100 chars): ' . substr($body['text'], -100));
        error_log('Audio-Press AI [DEBUG]: Language: ' . ($language ? $language : 'auto-detect'));
        error_log('Audio-Press AI [DEBUG]: Post ID: ' . $body['post_id']);
        
        // Encode JSON with error checking
        $json_body = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json_body === false) {
            error_log('Audio-Press AI [DEBUG]: JSON encoding failed: ' . json_last_error_msg());
            return new WP_Error('json_encode_error', __('Failed to encode request data', 'audio-press-ai'));
        }
        
        error_log('Audio-Press AI [DEBUG]: JSON body size: ' . strlen($json_body) . ' bytes');
        
        $args = array(
            'method' => 'POST',
            'headers' => array(
                'Content-Type' => 'application/json',
            ),
            'body' => $json_body,
            'timeout' => 120, // Longer timeout for AI generation
            'sslverify' => true, // Always verify SSL
        );
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            $error_code = $response->get_error_code();
            $error_message = $response->get_error_message();
            
            // Provide more user-friendly error messages
            if (strpos($error_message, 'timeout') !== false || strpos($error_code, 'timeout') !== false) {
                return new WP_Error('remote_api_error', __('Request timeout: The server took too long to respond. Please try again.', 'audio-press-ai'));
            } elseif (strpos($error_message, 'connection') !== false || strpos($error_code, 'connection') !== false) {
                return new WP_Error('remote_api_error', __('Connection error: Could not connect to the server. Please check your API server URL.', 'audio-press-ai'));
            }
            
            return new WP_Error('remote_api_error', sprintf(__('Network error: %s', 'audio-press-ai'), $error_message));
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code !== 200) {
            $error_data = json_decode(wp_remote_retrieve_body($response), true);
            
            // Provide specific error messages for common HTTP status codes
            $error_message = isset($error_data['error']) 
                ? $error_data['error'] 
                : '';
            
            if (empty($error_message)) {
                switch ($status_code) {
                    case 400:
                        $error_message = __('Bad request: Invalid parameters sent to server', 'audio-press-ai');
                        break;
                    case 401:
                        $error_message = __('Unauthorized: Authentication failed', 'audio-press-ai');
                        break;
                    case 403:
                        $error_message = __('Forbidden: License validation failed', 'audio-press-ai');
                        break;
                    case 429:
                        $error_message = __('Rate limit exceeded: Monthly character limit reached', 'audio-press-ai');
                        break;
                    case 502:
                        $error_message = __('Bad Gateway: The server is not responding. Please check if the server is running.', 'audio-press-ai');
                        break;
                    case 503:
                        $error_message = __('Service unavailable: The server is temporarily down', 'audio-press-ai');
                        break;
                    case 504:
                        $error_message = __('Gateway timeout: The server took too long to respond', 'audio-press-ai');
                        break;
                    default:
                        $error_message = sprintf(__('Server error (HTTP %d)', 'audio-press-ai'), $status_code);
                }
            }
            
            return new WP_Error('remote_api_error', $error_message);
        }
        
        return $response;
    }
    
    /**
     * Embed audio player in post content
     */
    public function embed_audio_player($content) {
        if (!is_singular() || !is_main_query()) {
            return $content;
        }
        
        $auto_embed = get_option('audio_press_ai_auto_embed', '1');
        if (!$auto_embed) {
            return $content;
        }
        
        $post_id = get_the_ID();
        $audio_id = get_post_meta($post_id, '_audio_press_mp3_id', true);
        
        if (!$audio_id) {
            return $content;
        }
        
        $audio_url = wp_get_attachment_url($audio_id);
        if (!$audio_url) {
            return $content;
        }
        
        // Build custom player HTML with proper escaping
        $unique_id = 'audio-press-ai-' . $post_id;
        $player_html = '<div class="audio-press-ai-player-wrapper" data-post-id="' . esc_attr($post_id) . '" style="direction: ltr;">';
        $player_html .= '<div class="audio-press-ai-custom-player">';
        $player_html .= '<div class="player-controls">';
        $player_html .= '<button class="play-pause-btn paused" id="' . esc_attr($unique_id) . '-play-pause" type="button" aria-label="Play/Pause"></button>';
        $player_html .= '<div class="player-info">';
        $player_html .= '<div class="progress-container">';
        $player_html .= '<div class="progress-bar-wrapper" id="' . esc_attr($unique_id) . '-progress-wrapper">';
        $player_html .= '<div class="progress-bar" id="' . esc_attr($unique_id) . '-progress"></div>';
        $player_html .= '</div>';
        $player_html .= '</div>';
        $player_html .= '<div class="time-display">';
        $player_html .= '<span class="time-current" id="' . esc_attr($unique_id) . '-time-current">0:00</span>';
        $player_html .= '<span class="time-separator">/</span>';
        $player_html .= '<span class="time-total" id="' . esc_attr($unique_id) . '-time-total">0:00</span>';
        $player_html .= '</div>';
        $player_html .= '</div>';
        $player_html .= '<div class="player-speed-control">';
        $player_html .= '<select id="' . esc_attr($unique_id) . '-speed-select" class="audio-speed-select" title="' . esc_attr__('Playback Speed', 'audio-press-ai') . '">';
        $player_html .= '<option value="0.5">0.5x</option>';
        $player_html .= '<option value="0.75">0.75x</option>';
        $player_html .= '<option value="1" selected>1x</option>';
        $player_html .= '<option value="1.25">1.25x</option>';
        $player_html .= '<option value="1.5">1.5x</option>';
        $player_html .= '<option value="1.75">1.75x</option>';
        $player_html .= '<option value="2">2x</option>';
        $player_html .= '</select>';
        $player_html .= '</div>';
        $player_html .= '</div>';
        $player_html .= '<audio id="' . esc_attr($unique_id) . '-audio-element" preload="metadata">';
        $player_html .= '<source src="' . esc_url($audio_url) . '" type="audio/wav">';
        $player_html .= '<source src="' . esc_url($audio_url) . '" type="audio/mpeg">';
        $player_html .= esc_html__('Your browser does not support the audio element.', 'audio-press-ai');
        $player_html .= '</audio>';
        $player_html .= '</div>';
        $player_html .= '</div>';
        
        // Add inline JavaScript to initialize player
        $player_html .= '<script>';
        $player_html .= '(function() {';
        $player_html .= 'var audio = document.getElementById("' . esc_js($unique_id) . '-audio-element");';
        $player_html .= 'if (!audio) return;';
        $player_html .= 'var playPauseBtn = document.getElementById("' . esc_js($unique_id) . '-play-pause");';
        $player_html .= 'var progressBar = document.getElementById("' . esc_js($unique_id) . '-progress");';
        $player_html .= 'var progressWrapper = document.getElementById("' . esc_js($unique_id) . '-progress-wrapper");';
        $player_html .= 'var timeCurrent = document.getElementById("' . esc_js($unique_id) . '-time-current");';
        $player_html .= 'var timeTotal = document.getElementById("' . esc_js($unique_id) . '-time-total");';
        
        $player_html .= 'function formatTime(seconds) {';
        $player_html .= 'if (isNaN(seconds) || !isFinite(seconds)) return "0:00";';
        $player_html .= 'var mins = Math.floor(seconds / 60);';
        $player_html .= 'var secs = Math.floor(seconds % 60);';
        $player_html .= 'return mins + ":" + (secs < 10 ? "0" : "") + secs;';
        $player_html .= '}';
        
        $player_html .= 'function updateTime() {';
        $player_html .= 'if (audio.duration) timeTotal.textContent = formatTime(audio.duration);';
        $player_html .= 'timeCurrent.textContent = formatTime(audio.currentTime);';
        $player_html .= 'if (audio.duration) {';
        $player_html .= 'var percent = (audio.currentTime / audio.duration) * 100;';
        $player_html .= 'progressBar.style.width = percent + "%";';
        $player_html .= '}';
        $player_html .= '}';
        
        $player_html .= 'audio.addEventListener("loadedmetadata", function() {';
        $player_html .= 'timeTotal.textContent = formatTime(audio.duration);';
        $player_html .= '});';
        
        $player_html .= 'audio.addEventListener("timeupdate", updateTime);';
        $player_html .= 'audio.addEventListener("loadeddata", updateTime);';
        
        $player_html .= 'playPauseBtn.addEventListener("click", function() {';
        $player_html .= 'if (audio.paused) {';
        $player_html .= 'audio.play().catch(function(err) { console.error("Error:", err); });';
        $player_html .= 'playPauseBtn.classList.remove("paused");';
        $player_html .= 'playPauseBtn.classList.add("playing");';
        $player_html .= '} else {';
        $player_html .= 'audio.pause();';
        $player_html .= 'playPauseBtn.classList.remove("playing");';
        $player_html .= 'playPauseBtn.classList.add("paused");';
        $player_html .= '}';
        $player_html .= '});';
        
        $player_html .= 'audio.addEventListener("play", function() {';
        $player_html .= 'playPauseBtn.classList.remove("paused");';
        $player_html .= 'playPauseBtn.classList.add("playing");';
        $player_html .= '});';
        
        $player_html .= 'audio.addEventListener("pause", function() {';
        $player_html .= 'playPauseBtn.classList.remove("playing");';
        $player_html .= 'playPauseBtn.classList.add("paused");';
        $player_html .= '});';
        
        $player_html .= 'progressWrapper.addEventListener("click", function(e) {';
        $player_html .= 'if (!audio.duration) return;';
        $player_html .= 'var rect = this.getBoundingClientRect();';
        $player_html .= 'var x = e.clientX - rect.left;';
        $player_html .= 'var percent = Math.max(0, Math.min(1, x / rect.width));';
        $player_html .= 'audio.currentTime = percent * audio.duration;';
        $player_html .= '});';
        
        $player_html .= 'var speedSelect = document.getElementById("' . esc_js($unique_id) . '-speed-select");';
        $player_html .= 'if (speedSelect) {';
        $player_html .= 'speedSelect.addEventListener("change", function() {';
        $player_html .= 'var speed = parseFloat(this.value);';
        $player_html .= 'if (!isNaN(speed) && speed > 0) {';
        $player_html .= 'audio.playbackRate = speed;';
        $player_html .= 'console.log("Audio speed changed to:", speed + "x");';
        $player_html .= '}';
        $player_html .= '});';
        $player_html .= '// Set initial speed to 1x';
        $player_html .= 'audio.playbackRate = 1;';
        $player_html .= '}';
        
        $player_html .= 'audio.load();';
        $player_html .= '})();';
        $player_html .= '</script>';
        
        return $player_html . $content;
    }
    
    /**
     * Auto-generate audio when post is published
     */
    public function maybe_auto_generate_audio($post_id, $post) {
        // Check if auto-generate is enabled
        $auto_generate = get_option('audio_press_ai_auto_generate', '0');
        if (!$auto_generate) {
            return;
        }
        
        // Check Pro license (unless in dev mode)
        if (!(defined('AUDIO_PRESS_AI_DEV_MODE') && AUDIO_PRESS_AI_DEV_MODE === true)) {
            if (!$this->is_pro_user()) {
                return;
            }
        }
        
        // Only for published posts
        if ($post->post_status !== 'publish') {
            return;
        }
        
        // Validate post ID
        $post_id = absint($post_id);
        if (!$post_id) {
            return;
        }
        
        // Don't generate if audio already exists
        $existing_audio = absint(get_post_meta($post_id, '_audio_press_mp3_id', true));
        if ($existing_audio) {
            return;
        }
        
        // Don't run on revisions
        if (wp_is_post_revision($post_id)) {
            return;
        }
        
        // Don't run on autosave
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        // Generate audio (async via WP Cron recommended)
        // Note: This action hook needs to be registered separately
        wp_schedule_single_event(time(), 'audio_press_ai_generate_audio', array($post_id));
    }
    
    /**
     * Enqueue admin scripts and styles
     */
    public function enqueue_admin_assets($hook) {
        // Load on post editor pages
        if (in_array($hook, array('post.php', 'post-new.php'))) {
            wp_enqueue_script(
                'audio-press-ai-admin',
                AUDIO_PRESS_AI_PLUGIN_URL . 'assets/js/admin.js',
                array('jquery'),
                AUDIO_PRESS_AI_VERSION,
                true
            );
            
            $post_id = isset($_GET['post']) ? absint($_GET['post']) : 0; // כשעורכים פוסט קיים
            wp_localize_script('audio-press-ai-admin', 'audioPressAI', array(
                'ajaxUrl'    => esc_url(admin_url('admin-ajax.php')),
                'nonce'      => wp_create_nonce('audio_press_ai_meta_box'),
                'postId'     => $post_id, // <<< חשוב: מזהה הפוסט עבור ה-AJAX
                'generating' => esc_html__('Generating audio... This may take 30 seconds...', 'audio-press-ai'),
            ));
            
            wp_enqueue_style(
                'audio-press-ai-admin',
                AUDIO_PRESS_AI_PLUGIN_URL . 'assets/css/admin.css',
                array(),
                AUDIO_PRESS_AI_VERSION
            );
        }
        
        // Load jQuery and admin styles on settings page (for test feature)
        if ($hook === 'audioai_page_audio-press-ai-settings' || $hook === 'toplevel_page_audioai') {
            // jQuery is already loaded in admin, but ensure it's available
            wp_enqueue_script('jquery');
            
            // Load admin CSS for player styles
            wp_enqueue_style(
                'audio-press-ai-admin',
                AUDIO_PRESS_AI_PLUGIN_URL . 'assets/css/admin.css',
                array(),
                AUDIO_PRESS_AI_VERSION
            );
        }
    }
    
    /**
     * Enqueue frontend scripts and styles
     */
    public function enqueue_frontend_assets() {
        wp_enqueue_style(
            'audio-press-ai-frontend',
            AUDIO_PRESS_AI_PLUGIN_URL . 'assets/css/frontend.css',
            array(),
            AUDIO_PRESS_AI_VERSION
        );
    }
}

