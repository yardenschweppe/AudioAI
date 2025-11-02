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
            // Check if is_paying is a method (callable)
            if (is_callable(array($fs, 'is_paying'))) {
                return $fs->is_paying();
            } elseif (isset($fs->is_paying)) {
                // Fallback if it's a property
                return (bool) $fs->is_paying;
            }
        } catch (Exception $e) {
            // Silently fail if there's an error
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
        register_setting('audio_press_ai_settings', 'audio_press_ai_api_server_url');
        register_setting('audio_press_ai_settings', 'audio_press_ai_voice');
        register_setting('audio_press_ai_settings', 'audio_press_ai_model');
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
        
        if (isset($_POST['submit'])) {
            check_admin_referer('audio_press_ai_settings');
            
            // Validate and sanitize API server URL
            if (isset($_POST['audio_press_ai_api_server_url'])) {
                $api_url = esc_url_raw(trim($_POST['audio_press_ai_api_server_url']));
                if (!empty($api_url) && filter_var($api_url, FILTER_VALIDATE_URL)) {
                    update_option('audio_press_ai_api_server_url', $api_url);
                }
            }
            
            // Validate and sanitize voice (whitelist)
            if (isset($_POST['audio_press_ai_voice'])) {
                $allowed_voices = array('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer');
                $voice = sanitize_text_field($_POST['audio_press_ai_voice']);
                if (in_array($voice, $allowed_voices, true)) {
                    update_option('audio_press_ai_voice', $voice);
                }
            }
            
            // Validate and sanitize model (whitelist)
            if (isset($_POST['audio_press_ai_model'])) {
                $allowed_models = array('tts-1', 'tts-1-hd');
                $model = sanitize_text_field($_POST['audio_press_ai_model']);
                if (in_array($model, $allowed_models, true)) {
                    update_option('audio_press_ai_model', $model);
                }
            }
            
            // Checkbox values
            update_option('audio_press_ai_auto_embed', isset($_POST['audio_press_ai_auto_embed']) ? '1' : '0');
            update_option('audio_press_ai_auto_generate', isset($_POST['audio_press_ai_auto_generate']) ? '1' : '0');
            
            echo '<div class="notice notice-success"><p>' . esc_html__('Settings saved!', 'audio-press-ai') . '</p></div>';
        }
        
        $api_server_url = get_option('audio_press_ai_api_server_url', AUDIO_PRESS_AI_API_URL);
        $voice = get_option('audio_press_ai_voice', 'nova');
        $model = get_option('audio_press_ai_model', 'tts-1-hd');
        $auto_embed = get_option('audio_press_ai_auto_embed', '1');
        $auto_generate = get_option('audio_press_ai_auto_generate', '0');
        $is_pro = $this->is_pro_user();
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
                            <label for="audio_press_ai_api_server_url"><?php _e('API Server URL', 'audio-press-ai'); ?></label>
                        </th>
                        <td>
                            <input type="text" 
                                   id="audio_press_ai_api_server_url" 
                                   name="audio_press_ai_api_server_url" 
                                   value="<?php echo esc_attr($api_server_url); ?>" 
                                   class="regular-text" />
                            <p class="description">
                                <?php _e('Your remote API server URL. All API keys are managed on the server - no need to configure them here.', 'audio-press-ai'); ?>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="audio_press_ai_voice"><?php _e('Voice Model', 'audio-press-ai'); ?></label>
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
                                <?php _e('Choose the voice for audio generation.', 'audio-press-ai'); ?>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="audio_press_ai_model"><?php _e('Quality', 'audio-press-ai'); ?></label>
                        </th>
                        <td>
                            <select id="audio_press_ai_model" name="audio_press_ai_model">
                                <option value="tts-1" <?php selected($model, 'tts-1'); ?>>tts-1 (Fast & Affordable)</option>
                                <option value="tts-1-hd" <?php selected($model, 'tts-1-hd'); ?>>tts-1-hd (High Quality)</option>
                            </select>
                            <p class="description">
                                <?php _e('tts-1 is faster and cheaper. tts-1-hd provides higher quality audio.', 'audio-press-ai'); ?>
                            </p>
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
        if (!isset($_POST['post_id']) || empty($_POST['post_id'])) {
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
        
        $model = get_option('audio_press_ai_model', 'tts-1-hd');
        $allowed_models = array('tts-1', 'tts-1-hd');
        if (!in_array($model, $allowed_models, true)) {
            $model = 'tts-1-hd'; // Default fallback
        }
        
        $api_server_url = get_option('audio_press_ai_api_server_url', AUDIO_PRESS_AI_API_URL);
        // Validate URL
        $api_server_url = esc_url_raw($api_server_url);
        if (empty($api_server_url) || !filter_var($api_server_url, FILTER_VALIDATE_URL)) {
            wp_send_json_error(array('message' => __('Invalid API server URL', 'audio-press-ai')));
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
        
        // Limit content length to prevent abuse (max 50,000 characters)
        if (strlen($content) > 50000) {
            $content = substr($content, 0, 50000);
        }
        
        if (empty($content)) {
            wp_send_json_error(array('message' => __('Post content is empty after processing', 'audio-press-ai')));
        }
        
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
        
        // Call remote API server
        $response = $this->call_remote_api($api_server_url, $license_key, $wp_user_id, $model, $voice, $content, $language);
        
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
        
        // Save to WordPress media library
        $upload = wp_upload_bits($filename, null, $file_contents);
        
        if ($upload['error']) {
            wp_send_json_error(array('message' => __('Failed to save audio file', 'audio-press-ai')));
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
        $attach_data = wp_generate_attachment_metadata($attachment_id, $upload['file']);
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
        
        $api_server_url = get_option('audio_press_ai_api_server_url', AUDIO_PRESS_AI_API_URL);
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
     * Call remote API server
     */
    private function call_remote_api($api_url, $license_key, $wp_user_id, $model, $voice, $text, $language = null) {
        // Validate and sanitize URL
        $base_url = esc_url_raw(rtrim($api_url, '/'));
        if (empty($base_url) || !filter_var($base_url, FILTER_VALIDATE_URL)) {
            return new WP_Error('invalid_url', __('Invalid API server URL', 'audio-press-ai'));
        }
        
        $url = $base_url . '/generate';
        
        // Sanitize all inputs
        $body = array(
            'license_key' => sanitize_text_field($license_key),
            'wp_user_id' => absint($wp_user_id),
            'model' => sanitize_text_field($model),
            'voice' => sanitize_text_field($voice),
            'text' => sanitize_textarea_field($text) // More appropriate for text content
        );
        
        // Add language if provided
        if ($language) {
            $body['language'] = sanitize_text_field($language);
        }
        
        // Validate text length
        if (empty($body['text']) || strlen($body['text']) > 50000) {
            return new WP_Error('invalid_text', __('Text is empty or too long', 'audio-press-ai'));
        }
        
        // Encode JSON with error checking
        $json_body = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json_body === false) {
            return new WP_Error('json_encode_error', __('Failed to encode request data', 'audio-press-ai'));
        }
        
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

