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

// Define plugin constants
define('AUDIO_PRESS_AI_VERSION', '1.0.0');
define('AUDIO_PRESS_AI_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('AUDIO_PRESS_AI_PLUGIN_URL', plugin_dir_url(__FILE__));
define('AUDIO_PRESS_AI_API_URL', 'https://chatix.co.il/audio-api'); // Audio-Press AI API Server

// Development mode - set to true for testing without Pro license
// Change to false for production
define('AUDIO_PRESS_AI_DEV_MODE', true); // Set to false in production!

// Freemius Integration Control
// Set to false to disable Freemius temporarily (for testing without Freemius)
// Set to true to enable Freemius when ready
define('AUDIO_PRESS_AI_FREEMIUS_ENABLED', false); // Change to true when ready to activate Freemius

// Block Freemius asset requests if disabled
if (!defined('AUDIO_PRESS_AI_FREEMIUS_ENABLED') || !AUDIO_PRESS_AI_FREEMIUS_ENABLED) {
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

// Freemius SDK integration
if (!function_exists('apai_fs')) {
    // Create a helper function for easy access to the Freemius SDK instance.
    function apai_fs() {
        global $apai_fs;

        if (!isset($apai_fs)) {
            // Check if Freemius is enabled
            if (!defined('AUDIO_PRESS_AI_FREEMIUS_ENABLED') || !AUDIO_PRESS_AI_FREEMIUS_ENABLED) {
                // Freemius is disabled - return dummy object to prevent errors
                $apai_fs = new class {
                    public function is_paying() {
                        return false;
                    }
                    public function _get_license() {
                        return false;
                    }
                    public function has_menu() {
                        return false;
                    }
                    public function get_upgrade_url() {
                        return '#';
                    }
                };
                return $apai_fs;
            }
            
            // Freemius is enabled - proceed with initialization
            // Check if Freemius SDK exists before including
            $freemius_file = dirname(__FILE__) . '/wordpress-sdk-master/start.php';
            
            if (file_exists($freemius_file)) {
                // Include Freemius SDK.
                require_once $freemius_file;

                $apai_fs = fs_dynamic_init(array(
                    'id'                  => '21493', // Plugin ID מ-Freemius
                    'slug'                => 'audio-press-ai',
                    'type'                => 'plugin',
                    'public_key'          => 'pk_c1f4731e093f2279f624161d5ee8b', // Public Key מ-Freemius
                    'is_premium'          => true,
                    'premium_suffix'      => 'Pro',
                    'has_premium_version' => true,
                    'has_addons'          => false,
                    'has_paid_plans'      => true,
                    'trial'               => array(
                        'days'               => 7,
                        'is_require_payment' => false,
                    ),
                    'menu'                => array(
                        'slug'           => 'audio-press-ai',
                        'first-path'     => 'admin.php?page=audio-press-ai',
                        'account'        => false,
                        'contact'        => false,
                        'support'        => false,
                    ),
                ));
            } else {
                // Freemius SDK not found - return dummy object to prevent errors
                // Create a class to mimic Freemius interface with methods
                $apai_fs = new class {
                    public function is_paying() {
                        return false;
                    }
                    public function _get_license() {
                        return false;
                    }
                    public function has_menu() {
                        return false;
                    }
                    public function get_upgrade_url() {
                        return '#';
                    }
                };
                
                // Show admin notice if we're in admin (only once)
                static $notice_shown = false;
                if (is_admin() && !$notice_shown) {
                    $notice_shown = true;
                    add_action('admin_notices', function() {
                        if (current_user_can('manage_options')) {
                            echo '<div class="notice notice-error"><p><strong>Audio-Press AI:</strong> Freemius SDK not found. Please download and install the Freemius SDK in the <code>wordpress-sdk-master</code> directory. <a href="https://github.com/Freemius/wordpress-sdk" target="_blank">Download SDK</a></p></div>';
                        }
                    });
                }
            }
        }

        return $apai_fs;
    }

    // Init Freemius (only if enabled and SDK exists).
    // If Freemius is disabled, apai_fs() will return a dummy object
    apai_fs();
    
    // Signal that SDK was initiated (only if Freemius is actually enabled)
    if (defined('AUDIO_PRESS_AI_FREEMIUS_ENABLED') && AUDIO_PRESS_AI_FREEMIUS_ENABLED) {
        do_action('apai_fs_loaded');
    }
}

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
