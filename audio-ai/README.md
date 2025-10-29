# Audio-Press AI - WordPress Plugin

Convert WordPress posts to high-quality audio using OpenAI TTS with BYOK (Bring Your Own Key) model.

## Features

- 🎙️ **Convert posts to audio** - Transform any blog post into a professional audio version
- 🎨 **High-quality voices** - Choose from 6 different voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
- ⚡ **Two quality modes** - Fast & affordable (tts-1) or high quality (tts-1-hd)
- 🔄 **Auto-generation** - Automatically generate audio when publishing new posts
- 🎧 **Auto-embed player** - Automatically embed audio player at the top of posts
- 💰 **BYOK Model** - Bring Your Own Key - you pay OpenAI directly, no monthly subscriptions
- ♿ **Accessibility** - Makes your content accessible to visually impaired users

## Installation

1. Upload the `audio-press-ai` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to **Audio-Press AI** in the admin menu
4. Enter your OpenAI API key (get one from [OpenAI Platform](https://platform.openai.com/api-keys))
5. Configure your preferred voice and quality settings
6. Start generating audio for your posts!

## Usage

### Generating Audio for a Post

1. Edit any post in WordPress
2. Look for the **Audio-Press AI** meta box in the sidebar
3. Click **"Generate Audio Version (AI)"**
4. Wait approximately 30 seconds for the audio to be generated
5. Preview the audio player and use **Regenerate** or **Delete** as needed

### Settings

Navigate to **Audio-Press AI** in the WordPress admin menu to configure:

- **OpenAI API Key**: Your personal API key from OpenAI
- **Voice Model**: Choose from 6 available voices
- **Quality**: Select between fast/affordable (tts-1) or high quality (tts-1-hd)
- **Auto-embed Player**: Automatically show audio player at the top of posts with audio
- **Auto-generate Audio**: Automatically create audio when publishing new posts

## Pricing

This plugin uses a **BYOK (Bring Your Own Key)** model:

- **Plugin**: One-time payment (set by you)
- **OpenAI Costs**: ~$0.015 per 1,000 characters
- **Example**: A 5,000 character post costs approximately $0.075

You pay OpenAI directly based on your usage - no monthly subscriptions, no hidden fees.

## Technical Details

- Uses OpenAI's Text-to-Speech API
- Stores audio files in WordPress media library
- Compatible with Gutenberg and Classic Editor
- Clean HTML extraction (removes tags, shortcodes)
- AJAX-based generation for smooth UX

## Requirements

- WordPress 5.0 or higher
- PHP 7.4 or higher
- Valid OpenAI API key
- cURL enabled (standard on most hosts)

## Support

For issues, questions, or feature requests, please contact the plugin developer.

## License

GPL v2 or later

