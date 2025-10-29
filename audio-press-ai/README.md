=== Audio-Press AI ===
Contributors: (your-wordpress.org-username)
Tags: audio, post to speech, tts, text to speech, ai, openai, accessibility
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Convert your blog posts into high-quality, human-like audio in one click using AI.

== Description ==

Audio-Press AI is the simplest way to add an audio version to your posts. 
Using the power of OpenAI's state-of-the-art TTS models, this plugin:

* Converts any post to audio in seconds.
* Adds a beautiful audio player to the top of your post.
* Increases user engagement and accessibility.
* **No API keys needed** - everything is handled by our secure server.

This plugin operates on a **subscription model** with Freemius integration. Upgrade to Pro for unlimited audio generation!

== How It Works ==

1. **Install & Upgrade:** Install the free plugin, then upgrade to Pro via Freemius
2. **Generate Audio:** Click "Generate Audio" on any post
3. **That's It!** Our secure remote server handles all API calls and processing
4. **No Configuration:** You don't need to set up OpenAI API keys - we handle it all

== Installation ==

1. Upload the `audio-press-ai` folder to your `/wp-content/plugins/` directory.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Upgrade to Pro through the Freemius popup (in the Audio-Press AI menu).
4. Configure your preferences in 'Settings > Audio-Press AI':
   - Choose your preferred voice
   - Set audio quality
   - Enable auto-embed/auto-generate if desired
5. That's it! You will now see a "Generate Audio" button in your post editor.

**Note:** No API keys or external service configuration needed - everything is handled securely on our servers.

== Frequently Asked Questions ==

= Do I need an OpenAI API key? =
No! All API keys are managed securely on our remote server. You just need a Pro subscription.

= Does this work with any language? =
Yes, the AI model supports most major languages automatically.

= How much does the Pro plan cost? =
Pricing is managed through Freemius. Click "Upgrade to Pro" in the plugin menu to see current pricing.

= How many audio files can I generate? =
Pro plans include 200,000 characters per month. You can generate as many audio files as you want within this limit.

= Where are my audio files stored? =
Audio files are stored in your WordPress media library, with backups on our secure cloud storage.

== Screenshots ==

1. The main settings page (no API keys needed!).
2. The "Generate Audio" button in the post editor.
3. The beautiful audio player at the top of a post.

== Architecture ==

**Client-Server Model:**
- Plugin sends text + license key to remote server
- Remote server validates license with Freemius
- Remote server calls OpenAI with secure API key
- Audio stored in WordPress media library

**Benefits:**
- ✅ No API key management for users
- ✅ Secure and centralized
- ✅ Usage tracking and metering
- ✅ Easy updates and maintenance

== Changelog ==

= 1.0.0 =
* Initial release. Everything is new!
* Freemius integration for subscriptions
* Remote server architecture
* No API keys needed on client side
