<?php
/**
 * Plugin Name: Audio-Press AI
 * Plugin URI: https://example.com/audio-press-ai
 * Description: Convert WordPress posts to high-quality audio using OpenAI TTS with BYOK (Bring Your Own Key) model.
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://example.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: audio-press-ai
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('AUDIO_PRESS_AI_VERSION', '1.0.0');
define('AUDIO_PRESS_AI_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('AUDIO_PRESS_AI_PLUGIN_URL', plugin_dir_url(__FILE__));

// Include required files
require_once AUDIO_PRESS_AI_PLUGIN_DIR . 'includes/class-audio-press-ai.php';

// Initialize the plugin
function audio_press_ai_init() {
    $plugin = new Audio_Press_AI();
    $plugin->init();
}
add_action('plugins_loaded', 'audio_press_ai_init');

// Activation hook
register_activation_hook(__FILE__, 'audio_press_ai_activate');
function audio_press_ai_activate() {
    // Set default options
    if (get_option('audio_press_ai_api_key') === false) {
        add_option('audio_press_ai_api_key', '');
    }
    if (get_option('audio_press_ai_voice') === false) {
        add_option('audio_press_ai_voice', 'nova');
    }
    if (get_option('audio_press_ai_model') === false) {
        add_option('audio_press_ai_model', 'tts-1-hd');
    }
    if (get_option('audio_press_ai_auto_embed') === false) {
        add_option('audio_press_ai_auto_embed', '1');
    }
    if (get_option('audio_press_ai_auto_generate') === false) {
        add_option('audio_press_ai_auto_generate', '0');
    }
}

// Deactivation hook
register_deactivation_hook(__FILE__, 'audio_press_ai_deactivate');
function audio_press_ai_deactivate() {
    // Cleanup if needed
}

