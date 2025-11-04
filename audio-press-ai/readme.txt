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

This plugin operates as a Software as a Service (SaaS) solution. The plugin code is fully available and open source, while audio generation functionality is provided through a remote service that requires a subscription. All code within the plugin is fully functional and available under GPL license.

== How It Works ==

1. **Install:** Install and activate the plugin
2. **Subscribe:** Subscribe to the audio generation service through Freemius
3. **Generate Audio:** Click "Generate Audio" on any post
4. **That's It!** Our secure remote server handles all API calls and processing
5. **No Configuration:** You don't need to set up OpenAI API keys - we handle it all

== Installation ==

1. Upload the `audio-press-ai` folder to your `/wp-content/plugins/` directory.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Subscribe to the audio generation service through Freemius (in the Audio-Press AI menu).
4. Configure your preferences in 'Settings > Audio-Press AI':
   * Choose your preferred voice
   * Enable auto-embed/auto-generate if desired
5. That's it! You will now see a "Generate Audio" button in your post editor.

**Note:** No API keys or external service configuration needed - everything is handled securely on our servers.

== Frequently Asked Questions ==

= Do I need an OpenAI API key? =
No! All API keys are managed securely on our remote server. You just need a subscription to the audio generation service.

= Does this work with any language? =
Yes, the AI model supports most major languages automatically, including English, Spanish, Portuguese, German, Dutch, Danish, Swedish, Hebrew, Arabic, Russian, and CJK languages (Chinese, Japanese, Korean).

= How much does the service cost? =
Pricing is managed through Freemius. Click "Upgrade to Pro" in the plugin menu to see current pricing.

= How many audio files can I generate? =
Service plans include 200,000 characters per month. You can generate as many audio files as you want within this limit.

= Where are my audio files stored? =
Audio files are stored in your WordPress media library.

= Is this plugin compatible with GPL? =
Yes. All plugin code is released under GPL-2.0-or-later license. The audio generation service is provided separately as a Software as a Service.

= Does the plugin track users? =
The plugin only contacts external servers when generating audio (with your explicit action) and when subscribing through Freemius (with opt-in consent). All tracking is opt-in and clearly disclosed in Freemius terms.

= Privacy Policy =
This plugin uses Freemius for subscription management. Freemius collects usage and diagnostic data with your explicit opt-in consent. You can view Freemius' privacy policy at https://freemius.com/privacy/. 

When you generate audio, the plugin sends the post text to our secure remote server for processing. The text is processed to generate audio and is not stored or used for any other purpose. Audio files are stored in your WordPress media library and are not shared with third parties.

No user data is collected or tracked without explicit consent. All external server communications are made only when you explicitly request audio generation.

== Screenshots ==

1. The main settings page (no API keys needed!).
2. The "Generate Audio" button in the post editor.
3. The beautiful audio player at the top of a post.

== Changelog ==

= 1.0.0 =
* Initial release
* Freemius integration for service subscriptions
* Remote server architecture for audio generation
* Multi-language support
* No API keys needed on client side
* All code fully available under GPL license

