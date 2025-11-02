<?php
/**
 * Plugin Name: Audio-Press AI
 * Plugin URI: https://example.com/audio-press-ai
 * Description: Convert WordPress posts to high-quality audio using AI. Premium subscription via Freemius.
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

// === Freemius SDK Bootstrap ===
// Freemius Integration Control - set to true to enable Freemius
define('AUDIO_PRESS_AI_FREEMIUS_ENABLED', true); // Change to false to disable Freemius

if ( ! function_exists( 'audioai_fs' ) ) {
    function audioai_fs() {
        global $audioai_fs;

        if ( ! isset( $audioai_fs ) ) {
            // Check if Freemius is enabled
            if ( ! defined( 'AUDIO_PRESS_AI_FREEMIUS_ENABLED' ) || ! AUDIO_PRESS_AI_FREEMIUS_ENABLED ) {
                // Freemius disabled - return dummy object
                $audioai_fs = new class {
                    public function is_paying() { return false; }
                    public function _get_license() { return false; }
                    public function has_menu() { return false; }
                    public function get_upgrade_url() { return '#'; }
                };
                return $audioai_fs;
            }

            // Freemius enabled - load SDK
            $freemius_file = dirname( __FILE__ ) . '/freemius/start.php';
            
            // Fallback to wordpress-sdk-master if freemius directory doesn't exist
            if ( ! file_exists( $freemius_file ) ) {
                $freemius_file = dirname( __FILE__ ) . '/wordpress-sdk-master/start.php';
            }
            
            if ( file_exists( $freemius_file ) ) {
                require_once $freemius_file;

                $audioai_fs = fs_dynamic_init( array(
                    'id'                  => '21493',              // מספר Product ID מ-Freemius Dashboard
                    'slug'                => 'audioai',            // slug של התוסף (חייב להתאים ל-slug ב-Freemius Dashboard)
                    'type'                => 'plugin',
                    'public_key'          => 'pk_c1f4731e093f2279f624161d5ee8b',  // Public Key מ-Freemius Dashboard
                    'is_premium'          => false,                 // false = יש גרסה חינמית (Free Plan)
                    'has_premium_version' => true,                 // true = יש גם גרסה בתשלום (Premium Plan)
                    'has_addons'          => false,
                    'has_paid_plans'      => true,                 // true = יש תוכניות בתשלום
                    'menu'                => array(
                        'slug'           => 'audioai',  // חייב להתאים ל-slug ב-Freemius Dashboard
                        'account'        => false,  // הסתר Account
                        'contact'        => true,   // הצג Contact Us
                        'support'        => false,  // הסתר wp.org Support Forum
                    ),
                ) );
            } else {
                // Freemius SDK not found - return dummy object
                $audioai_fs = new class {
                    public function is_paying() { return false; }
                    public function _get_license() { return false; }
                    public function has_menu() { return false; }
                    public function get_upgrade_url() { return '#'; }
                };
            }
        }

        return $audioai_fs;
    }

    // אתחול ה-SDK + hook לטעינה
    audioai_fs();
    do_action( 'audioai_fs_loaded' );
    
    // Alias for backward compatibility with existing code
    if ( ! function_exists( 'apai_fs' ) ) {
        function apai_fs() {
            return audioai_fs();
        }
    }
}
// === /Freemius SDK Bootstrap ===

// Define plugin constants
define('AUDIO_PRESS_AI_VERSION', '1.0.0');
define('AUDIO_PRESS_AI_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('AUDIO_PRESS_AI_PLUGIN_URL', plugin_dir_url(__FILE__));
define('AUDIO_PRESS_AI_API_URL', 'https://chatix.co.il/audio-api'); // Audio-Press AI API Server

// Development mode - set to true for testing without Pro license
// Change to false for production
define('AUDIO_PRESS_AI_DEV_MODE', false); // Set to false in production!

// Block Freemius asset requests ONLY if explicitly disabled
// This code should NOT run if Freemius is enabled
if (defined('AUDIO_PRESS_AI_FREEMIUS_ENABLED') && AUDIO_PRESS_AI_FREEMIUS_ENABLED === false) {
    // Prevent Freemius from trying to load assets by blocking its hooks early
    add_action('init', function() {
        // Remove any Freemius hooks if they exist
        remove_all_actions('fs_after_license_loaded');
        remove_all_actions('fs_after_account_loaded');
        remove_all_actions('fs_account_page_load_before_departure');
        remove_all_actions('fs_after_plugin_installed');
    }, 1);
    
    // Block Freemius asset URLs (scripts and styles)
    add_filter('script_loader_src', function($src, $handle) {
        if ($src && (strpos($src, 'freemius') !== false || strpos($src, 'api.freemius.com') !== false)) {
            return false; // Block Freemius scripts
        }
        return $src;
    }, 10, 2);
    
    add_filter('style_loader_src', function($src, $handle) {
        if ($src && (strpos($src, 'freemius') !== false || strpos($src, 'api.freemius.com') !== false)) {
            return false; // Block Freemius styles
        }
        return $src;
    }, 10, 2);
    
    // Block HTTP requests to Freemius API if attempted
    add_filter('http_request_args', function($args, $url) {
        if (is_string($url) && (strpos($url, 'api.freemius.com') !== false || strpos($url, 'freemius.com') !== false)) {
            // Block all requests to Freemius API
            return false;
        }
        return $args;
    }, 10, 2);
    
    // Prevent WordPress from trying to update plugin via Freemius
    add_filter('site_transient_update_plugins', function($value) {
        if (isset($value->response)) {
            foreach ($value->response as $plugin_file => $plugin_data) {
                if (strpos($plugin_file, 'audio-press-ai') !== false && isset($plugin_data->package) && strpos($plugin_data->package, 'freemius') !== false) {
                    unset($value->response[$plugin_file]);
                }
            }
        }
        return $value;
    });
}

// Note: Freemius SDK is now initialized above using audioai_fs()
// The apai_fs() function is an alias for backward compatibility

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
    if (get_option('audio_press_ai_api_server_url') === false) {
        add_option('audio_press_ai_api_server_url', AUDIO_PRESS_AI_API_URL);
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
