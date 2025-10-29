# Security Features - Audio-Press AI

This document outlines all security measures implemented in the Audio-Press AI plugin.

## Input Validation & Sanitization

### Settings Page
- ✅ **Capability Check**: `current_user_can('manage_options')` - Only admins can access settings
- ✅ **Nonce Verification**: `check_admin_referer()` - CSRF protection
- ✅ **URL Validation**: `filter_var($url, FILTER_VALIDATE_URL)` - Validates API server URL
- ✅ **Whitelist Validation**: Voice and model values checked against allowed arrays
- ✅ **Input Sanitization**: All inputs sanitized with `sanitize_text_field()`, `esc_url_raw()`

### AJAX Handlers
- ✅ **Nonce Verification**: `check_ajax_referer()` on all AJAX requests
- ✅ **Post ID Validation**: `absint()` and `is_numeric()` checks
- ✅ **Capability Checks**: `current_user_can('edit_posts')` and `current_user_can('edit_post', $post_id)`
- ✅ **Post Existence**: Verifies post exists before processing
- ✅ **Post Ownership**: Checks user can edit specific post
- ✅ **Content Length Limit**: Max 50,000 characters to prevent abuse
- ✅ **File Size Limit**: Max 25MB for downloaded audio files

### File Operations
- ✅ **File Existence Check**: Verifies file exists before reading
- ✅ **File Size Validation**: Checks file size before processing
- ✅ **Error Handling**: Proper error handling for file operations
- ✅ **Cleanup**: Temp files deleted after processing
- ✅ **Attachment Verification**: Verifies attachment belongs to post before deletion

### Remote API Calls
- ✅ **URL Validation**: Validates API URL before requests
- ✅ **Input Sanitization**: All data sanitized before JSON encoding
- ✅ **JSON Encoding Validation**: Checks for JSON encoding errors
- ✅ **SSL Verification**: `sslverify => true` - Always verifies SSL certificates
- ✅ **Response Validation**: Validates JSON response and checks for errors
- ✅ **URL Validation**: Validates audio URL before downloading

## Output Escaping

- ✅ **esc_html()**: All user-facing text escaped
- ✅ **esc_url()**: All URLs escaped
- ✅ **esc_attr()**: All HTML attributes escaped
- ✅ **esc_html__()**: Translation strings escaped
- ✅ **esc_url_raw()**: URLs for storage escaped
- ✅ **sanitize_file_name()**: File names sanitized
- ✅ **sanitize_text_field()**: Text fields sanitized

## Authorization & Access Control

- ✅ **Capability Checks**: 
  - `manage_options` for settings page
  - `edit_posts` for AJAX operations
  - `edit_post` for post-specific operations
- ✅ **Post-Level Permissions**: Checks user can edit specific post
- ✅ **Meta Box Access**: Checks permissions before rendering
- ✅ **Auto-Save Prevention**: Skips processing on autosaves

## Data Validation

- ✅ **Whitelist Approach**: Voice and model values validated against allowed arrays
- ✅ **Type Checking**: Uses `absint()` for numeric values
- ✅ **Existence Checks**: Verifies posts, attachments, and files exist
- ✅ **Content Validation**: Validates content before processing
- ✅ **Length Limits**: Enforces max length for content and files

## XSS Prevention

- ✅ All output escaped with appropriate functions
- ✅ JSON responses sanitized
- ✅ Error messages sanitized
- ✅ User input never directly output

## SQL Injection Prevention

- ✅ Uses WordPress functions (`get_post_meta()`, `update_post_meta()`) which escape SQL
- ✅ Uses `absint()` for numeric values
- ✅ No direct SQL queries

## CSRF Protection

- ✅ Nonce fields on all forms
- ✅ Nonce verification on all form submissions
- ✅ Nonce verification on all AJAX requests

## File Upload Security

- ✅ Uses WordPress `wp_upload_bits()` function
- ✅ File size validation
- ✅ File type validation (MP3 only)
- ✅ Secure file naming with `sanitize_file_name()`
- ✅ Attachment ownership verification

## Best Practices

- ✅ Direct file access prevented with `ABSPATH` check
- ✅ Proper error messages (no sensitive info)
- ✅ Graceful error handling
- ✅ Input validation before processing
- ✅ Output escaping throughout

## Security Checklist for WordPress.org Review

- [x] All inputs validated and sanitized
- [x] All outputs escaped
- [x] Capability checks on all admin functions
- [x] Nonce verification on all forms and AJAX
- [x] No direct SQL queries
- [x] No eval() or dangerous functions
- [x] File operations secured
- [x] Remote requests use SSL verification
- [x] Error messages don't leak sensitive info
- [x] Post-level permissions checked

## Contact

For security concerns, please contact the plugin author.

