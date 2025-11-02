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
     * Add admin menu page
     */
    public function add_admin_menu() {
        add_menu_page(
            __('Audio-Press AI', 'audio-press-ai'),
            __('Audio-Press AI', 'audio-press-ai'),
            'manage_options',
            'audio-press-ai',
            array($this, 'render_settings_page'),
            'dashicons-microphone',
            30
        );
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        register_setting('audio_press_ai_settings', 'audio_press_ai_api_key');
        register_setting('audio_press_ai_settings', 'audio_press_ai_voice');
        register_setting('audio_press_ai_settings', 'audio_press_ai_model');
        register_setting('audio_press_ai_settings', 'audio_press_ai_auto_embed');
        register_setting('audio_press_ai_settings', 'audio_press_ai_auto_generate');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (isset($_POST['submit'])) {
            check_admin_referer('audio_press_ai_settings');
            update_option('audio_press_ai_api_key', sanitize_text_field($_POST['audio_press_ai_api_key']));
            update_option('audio_press_ai_voice', sanitize_text_field($_POST['audio_press_ai_voice']));
            update_option('audio_press_ai_model', sanitize_text_field($_POST['audio_press_ai_model']));
            update_option('audio_press_ai_auto_embed', isset($_POST['audio_press_ai_auto_embed']) ? '1' : '0');
            update_option('audio_press_ai_auto_generate', isset($_POST['audio_press_ai_auto_generate']) ? '1' : '0');
            echo '<div class="notice notice-success"><p>' . __('Settings saved!', 'audio-press-ai') . '</p></div>';
        }
        
        $api_key = get_option('audio_press_ai_api_key', '');
        $voice = get_option('audio_press_ai_voice', 'nova');
        $model = get_option('audio_press_ai_model', 'tts-1-hd');
        $auto_embed = get_option('audio_press_ai_auto_embed', '1');
        $auto_generate = get_option('audio_press_ai_auto_generate', '0');
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            <form method="post" action="">
                <?php wp_nonce_field('audio_press_ai_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="audio_press_ai_api_key"><?php _e('OpenAI API Key', 'audio-press-ai'); ?></label>
                        </th>
                        <td>
                            <input type="password" 
                                   id="audio_press_ai_api_key" 
                                   name="audio_press_ai_api_key" 
                                   value="<?php echo esc_attr($api_key); ?>" 
                                   class="regular-text" 
                                   autocomplete="off" />
                            <p class="description">
                                <?php _e('Enter your OpenAI API key. Get one from:', 'audio-press-ai'); ?> 
                                <a href="https://platform.openai.com/api-keys" target="_blank">https://platform.openai.com/api-keys</a>
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
        $audio_id = get_post_meta($post->ID, '_audio_press_mp3_id', true);
        $audio_url = $audio_id ? wp_get_attachment_url($audio_id) : '';
        
        wp_nonce_field('audio_press_ai_meta_box', 'audio_press_ai_nonce');
        ?>
        <div id="audio-press-ai-container" data-post-id="<?php echo esc_attr($post->ID); ?>">
            <?php if ($audio_url): ?>
                <div id="audio-press-ai-player-wrapper">
                    <audio controls style="width: 100%; margin-bottom: 10px;">
                        <source src="<?php echo esc_url($audio_url); ?>" type="audio/mpeg">
                        <?php _e('Your browser does not support the audio element.', 'audio-press-ai'); ?>
                    </audio>
                    <div style="display: flex; gap: 5px;">
                        <button type="button" 
                                class="button button-secondary" 
                                id="audio-press-ai-regenerate">
                            <?php _e('Regenerate Audio', 'audio-press-ai'); ?>
                        </button>
                        <button type="button" 
                                class="button button-link-delete" 
                                id="audio-press-ai-delete">
                            <?php _e('Delete Audio', 'audio-press-ai'); ?>
                        </button>
                    </div>
                </div>
            <?php else: ?>
                <button type="button" 
                        class="button button-primary button-large" 
                        id="audio-press-ai-generate" 
                        style="width: 100%;">
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
        check_ajax_referer('audio_press_ai_meta_box', 'nonce');
        
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        $post_id = intval($_POST['post_id']);
        if (!$post_id) {
            wp_send_json_error(array('message' => __('Invalid post ID', 'audio-press-ai')));
        }
        
        $api_key = get_option('audio_press_ai_api_key');
        if (empty($api_key)) {
            wp_send_json_error(array('message' => __('OpenAI API key is not configured', 'audio-press-ai')));
        }
        
        $voice = get_option('audio_press_ai_voice', 'nova');
        $model = get_option('audio_press_ai_model', 'tts-1-hd');
        
        // Get post content
        $content = get_post_field('post_content', $post_id);
        
        // Clean content: remove HTML, shortcodes, etc.
        $content = wp_strip_all_tags($content);
        $content = do_shortcode($content);
        $content = wp_strip_all_tags($content);
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            wp_send_json_error(array('message' => __('Post content is empty', 'audio-press-ai')));
        }
        
        // Delete old audio if exists (regeneration)
        $old_audio_id = get_post_meta($post_id, '_audio_press_mp3_id', true);
        if ($old_audio_id) {
            wp_delete_attachment($old_audio_id, true);
        }
        
        // Call OpenAI API
        $response = $this->call_openai_api($api_key, $model, $voice, $content);
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        // Save audio file to WordPress media library
        $post_title = get_the_title($post_id);
        $filename = sanitize_file_name($post_title) . '-audio-' . time() . '.mp3';
        
        $upload = wp_upload_bits($filename, null, $response);
        
        if ($upload['error']) {
            wp_send_json_error(array('message' => __('Failed to save audio file', 'audio-press-ai')));
        }
        
        // Create attachment
        $attachment = array(
            'post_mime_type' => 'audio/mpeg',
            'post_title' => $post_title . ' - Audio',
            'post_content' => '',
            'post_status' => 'inherit'
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
        
        wp_send_json_success(array(
            'audio_url' => wp_get_attachment_url($attachment_id),
            'message' => __('Audio generated successfully!', 'audio-press-ai')
        ));
    }
    
    /**
     * AJAX handler for deleting audio
     */
    public function ajax_delete_audio() {
        check_ajax_referer('audio_press_ai_meta_box', 'nonce');
        
        if (!current_user_can('edit_posts')) {
            wp_send_json_error(array('message' => __('Insufficient permissions', 'audio-press-ai')));
        }
        
        $post_id = intval($_POST['post_id']);
        if (!$post_id) {
            wp_send_json_error(array('message' => __('Invalid post ID', 'audio-press-ai')));
        }
        
        $audio_id = get_post_meta($post_id, '_audio_press_mp3_id', true);
        if ($audio_id) {
            wp_delete_attachment($audio_id, true);
            delete_post_meta($post_id, '_audio_press_mp3_id');
        }
        
        wp_send_json_success(array('message' => __('Audio deleted successfully', 'audio-press-ai')));
    }
    
    /**
     * Call OpenAI TTS API
     */
    private function call_openai_api($api_key, $model, $voice, $text) {
        $url = 'https://api.openai.com/v1/audio/speech';
        
        $body = array(
            'model' => $model,
            'input' => $text,
            'voice' => $voice
        );
        
        $args = array(
            'method' => 'POST',
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ),
            'body' => json_encode($body),
            'timeout' => 60,
        );
        
        $response = wp_remote_request($url, $args);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);
        
        if ($status_code !== 200) {
            $error_data = json_decode($response_body, true);
            $error_message = isset($error_data['error']['message']) 
                ? $error_data['error']['message'] 
                : __('OpenAI API error', 'audio-press-ai');
            return new WP_Error('openai_api_error', $error_message);
        }
        
        return $response_body; // Binary audio data
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
        
        $player_html = '<div class="audio-press-ai-player-wrapper">';
        $player_html .= '<span class="audio-label">' . __('האזנה לפוסט', 'audio-press-ai') . '</span>';
        $player_html .= '<audio controls class="audio-press-ai-player">';
        $player_html .= '<source src="' . esc_url($audio_url) . '" type="audio/mpeg">';
        $player_html .= __('Your browser does not support the audio element.', 'audio-press-ai');
        $player_html .= '</audio>';
        $player_html .= '</div>';
        
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
        
        // Only for published posts
        if ($post->post_status !== 'publish') {
            return;
        }
        
        // Don't generate if audio already exists
        $existing_audio = get_post_meta($post_id, '_audio_press_mp3_id', true);
        if ($existing_audio) {
            return;
        }
        
        // Don't run on revisions
        if (wp_is_post_revision($post_id)) {
            return;
        }
        
        // Generate audio (this will run in background, might want to use WP Cron)
        $this->generate_audio_for_post($post_id);
    }
    
    /**
     * Generate audio for a post (internal method for auto-generate)
     */
    private function generate_audio_for_post($post_id) {
        $api_key = get_option('audio_press_ai_api_key');
        if (empty($api_key)) {
            return;
        }
        
        $voice = get_option('audio_press_ai_voice', 'nova');
        $model = get_option('audio_press_ai_model', 'tts-1-hd');
        
        $content = get_post_field('post_content', $post_id);
        $content = wp_strip_all_tags($content);
        $content = do_shortcode($content);
        $content = wp_strip_all_tags($content);
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            return;
        }
        
        $response = $this->call_openai_api($api_key, $model, $voice, $content);
        
        if (is_wp_error($response)) {
            return;
        }
        
        $post_title = get_the_title($post_id);
        $filename = sanitize_file_name($post_title) . '-audio-' . time() . '.mp3';
        
        $upload = wp_upload_bits($filename, null, $response);
        
        if ($upload['error']) {
            return;
        }
        
        $attachment = array(
            'post_mime_type' => 'audio/mpeg',
            'post_title' => $post_title . ' - Audio',
            'post_content' => '',
            'post_status' => 'inherit'
        );
        
        $attachment_id = wp_insert_attachment($attachment, $upload['file'], $post_id);
        
        if (!is_wp_error($attachment_id)) {
            require_once(ABSPATH . 'wp-admin/includes/image.php');
            $attach_data = wp_generate_attachment_metadata($attachment_id, $upload['file']);
            wp_update_attachment_metadata($attachment_id, $attach_data);
            
            update_post_meta($post_id, '_audio_press_mp3_id', $attachment_id);
        }
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
            
            wp_localize_script('audio-press-ai-admin', 'audioPressAI', array(
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('audio_press_ai_meta_box'),
                'generating' => __('Generating audio... This may take 30 seconds...', 'audio-press-ai'),
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

